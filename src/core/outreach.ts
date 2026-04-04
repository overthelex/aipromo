import chalk from "chalk";
import inquirer from "inquirer";
import { UnipileService } from "../services/unipile.service.js";
import { ClaudeService, type LeadProfile } from "../services/claude.service.js";
import { sql } from "../storage/store.js";
import { getTemplate, listTemplateNames } from "../templates/outreach-templates.js";
import {
  checkDailyLimit,
  incrementDailyCount,
  isBusinessHours,
  sleepWithJitter,
} from "../utils/rate-limiter.js";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";

export interface StartCampaignOptions {
  template: string;
  tag: string;
  limit: number;
  dryRun: boolean;
  accountAlias?: string;
}

export async function startCampaign(opts: StartCampaignOptions): Promise<void> {
  const templateText = getTemplate(opts.template);
  if (!templateText) {
    const available = listTemplateNames().join(", ");
    console.log(
      chalk.red(`Template "${opts.template}" not found. Available: ${available}`)
    );
    return;
  }

  // Get leads by tag
  const leads = await sql`
    SELECT * FROM leads
    WHERE tags LIKE ${"%" + opts.tag + "%"}
    ORDER BY imported_at DESC
    LIMIT ${opts.limit}
  `;

  if (leads.length === 0) {
    console.log(chalk.yellow(`No leads found with tag "${opts.tag}".`));
    return;
  }

  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;

  // Create campaign
  const [campaign] = await sql`
    INSERT INTO outreach_campaigns (account_id, name, template, target_tags, status)
    VALUES (
      ${accountId},
      ${`${opts.template}-${opts.tag}-${new Date().toISOString().slice(0, 10)}`},
      ${opts.template},
      ${opts.tag},
      'active'
    )
    RETURNING id, name
  `;

  console.log(
    chalk.bold(`Campaign "${campaign.name}" — ${leads.length} leads\n`)
  );

  const claude = new ClaudeService();

  // Preview first 3
  console.log(chalk.dim("Previewing first 3 messages:\n"));
  const previews: Array<{ lead: any; message: string }> = [];

  for (const lead of leads.slice(0, 3)) {
    const profile: LeadProfile = {
      name: lead.name,
      headline: lead.headline,
      company: lead.company,
      title: lead.title,
      location: lead.location,
    };
    const message = await claude.generateOutreachMessage(profile, templateText);
    previews.push({ lead, message });
    console.log(`  ${chalk.bold(lead.name)} (${lead.company}):`);
    console.log(`  ${chalk.green(message)}\n`);
  }

  if (opts.dryRun) {
    console.log(chalk.dim("(dry run — not sending or queuing)"));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Proceed with sending to ${leads.length} leads?`,
      default: false,
    },
  ]);

  if (!confirm) {
    await sql`
      UPDATE outreach_campaigns SET status = 'paused' WHERE id = ${campaign.id}
    `;
    console.log(chalk.yellow("Campaign paused."));
    return;
  }

  // Queue and send
  let sentCount = 0;

  for (const lead of leads) {
    const canSend = await checkDailyLimit(
      accountId,
      "message",
      appConfig.maxMessagesPerDay
    );
    if (!canSend) {
      console.log(chalk.yellow("Daily limit reached. Remaining leads queued."));

      // Queue remaining
      for (const remaining of leads.slice(leads.indexOf(lead))) {
        await sql`
          INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status)
          VALUES (${campaign.id}, ${remaining.id}, '', 'pending')
        `;
      }
      break;
    }

    if (!isBusinessHours()) {
      console.log(chalk.yellow("Outside business hours. Remaining leads queued."));
      break;
    }

    // Check if already in preview
    const existing = previews.find((p) => p.lead.id === lead.id);
    let message: string;

    if (existing) {
      message = existing.message;
    } else {
      const profile: LeadProfile = {
        name: lead.name,
        headline: lead.headline,
        company: lead.company,
        title: lead.title,
        location: lead.location,
      };
      message = await claude.generateOutreachMessage(profile, templateText);
    }

    try {
      await unipile.startChat(lead.linkedin_id, message);
      await incrementDailyCount(accountId, "message");
      sentCount++;

      await sql`
        INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status, sent_at)
        VALUES (${campaign.id}, ${lead.id}, ${message}, 'sent', NOW())
      `;

      console.log(chalk.green(`  Sent to ${lead.name}`));
    } catch (err: any) {
      logger.error({ lead: lead.name, error: err.message }, "Failed to send");
      await sql`
        INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status)
        VALUES (${campaign.id}, ${lead.id}, ${message}, 'failed')
      `;
      console.log(chalk.red(`  Failed: ${lead.name} — ${err.message}`));
    }
  }

  // Update campaign status
  await sql`
    UPDATE outreach_campaigns SET status = 'completed' WHERE id = ${campaign.id}
  `;

  console.log(chalk.bold(`\nDone. Sent: ${sentCount}/${leads.length}`));
}

export async function pauseCampaign(campaignId: number): Promise<void> {
  await sql`
    UPDATE outreach_campaigns SET status = 'paused' WHERE id = ${campaignId}
  `;
}

export async function listCampaigns(): Promise<
  Array<{ id: number; name: string; status: string; targetTags: string; createdAt: string }>
> {
  const rows = await sql`
    SELECT id, name, status, target_tags, created_at
    FROM outreach_campaigns
    ORDER BY created_at DESC
  `;
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    targetTags: r.target_tags,
    createdAt: r.created_at,
  }));
}

export async function getCampaignStatus(campaignId: number): Promise<{
  name: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
}> {
  const [campaign] = await sql`
    SELECT name, status FROM outreach_campaigns WHERE id = ${campaignId}
  `;
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const [counts] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending
    FROM outreach_queue
    WHERE campaign_id = ${campaignId}
  `;

  return {
    name: campaign.name,
    status: campaign.status,
    total: Number(counts.total),
    sent: Number(counts.sent),
    failed: Number(counts.failed),
    pending: Number(counts.pending),
  };
}
