import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { runCampaignDay } from "../../campaigns/engine.js";
import { getCampaign, listCampaigns } from "../../campaigns/registry.js";
import { getAccountOption } from "../cli.js";
import { resolveAccountName, resolveAccountId } from "../../config.js";
import { sql } from "../../storage/store.js";
import chalk from "chalk";

export function registerCampaignCommand(parent: Command): void {
  const campaign = parent
    .command("campaign")
    .description("Run automated campaigns");

  campaign
    .command("run")
    .description("Run one day of a campaign")
    .requiredOption("--campaign <name>", `Campaign name (${listCampaigns().join(", ")})`)
    .option("--day <n>", "Campaign day number (1-14)")
    .option("--max-leads <n>", "Max new leads to search", "25")
    .option("--max-messages <n>", "Max outreach messages to send", "20")
    .option("--dry-run", "Preview without sending")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        const cam = getCampaign(opts.campaign);
        console.log(chalk.dim(`Account: ${accountName} | Campaign: ${cam.name}`));
        console.log(chalk.dim(`Channels: ${cam.channels.join(", ")}`));

        let dayNumber = opts.day ? parseInt(opts.day, 10) : await detectDayNumber(accountId, cam.name);

        if (dayNumber > cam.dailySearchQueries.length) {
          console.log(chalk.yellow(`Campaign completed (${cam.dailySearchQueries.length} days). Use --day to override.`));
          return;
        }

        const result = await runCampaignDay({
          campaign: cam,
          accountAlias: account,
          dayNumber,
          maxNewLeads: parseInt(opts.maxLeads, 10),
          maxMessages: parseInt(opts.maxMessages, 10),
          dryRun: opts.dryRun ?? false,
        });

        console.log(chalk.bold(`\n=== Day ${dayNumber} Summary ===`));
        console.log(`  Leads found:      ${result.searched}`);
        console.log(`  Messages sent:    ${result.messaged}`);
        if (result.scheduled > 0) console.log(`  Scheduled:        ${result.scheduled}`);
        if (result.instagramDMs > 0) console.log(`  Instagram DMs:    ${result.instagramDMs}`);
        console.log(`  Replies handled:  ${result.replied}`);
        if (result.followUps > 0) console.log(`  Follow-ups:       ${result.followUps}`);
      } finally {
        await closeDatabase();
      }
    });

  campaign
    .command("status")
    .description("Show campaign progress")
    .requiredOption("--campaign <name>", `Campaign name (${listCampaigns().join(", ")})`)
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        const cam = getCampaign(opts.campaign);
        console.log(chalk.bold(`Campaign: ${cam.name}`));
        console.log(chalk.dim(`Account: ${accountName} | Channels: ${cam.channels.join(", ")}\n`));

        const [leadCount] = await sql`
          SELECT COUNT(*) as count FROM leads
          WHERE account_id = ${accountId} AND tags LIKE ${'%campaign-' + cam.name + '%'}
        `;

        const [campaignRow] = await sql`
          SELECT id FROM outreach_campaigns
          WHERE account_id = ${accountId} AND name = ${cam.name}
        `;

        let sent = 0, failed = 0, pending = 0, scheduled = 0;
        if (campaignRow) {
          const [counts] = await sql`
            SELECT
              COUNT(*) FILTER (WHERE status = 'sent') as sent,
              COUNT(*) FILTER (WHERE status = 'failed') as failed,
              COUNT(*) FILTER (WHERE status = 'pending') as pending,
              COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
              COUNT(*) FILTER (WHERE message_angle LIKE 'ig_%') as ig_sent
            FROM outreach_queue WHERE campaign_id = ${campaignRow.id}
          `;
          sent = Number(counts.sent);
          failed = Number(counts.failed);
          pending = Number(counts.pending);
          scheduled = Number(counts.scheduled);
          console.log(`  Instagram DMs:  ${Number(counts.ig_sent)}`);
        }

        const dayNumber = await detectDayNumber(accountId, cam.name);

        console.log(`  Day:           ${dayNumber}/${cam.dailySearchQueries.length}`);
        console.log(`  Leads found:   ${Number(leadCount.count)}`);
        console.log(`  Sent:          ${sent}`);
        console.log(`  Scheduled:     ${scheduled}`);
        console.log(`  Failed:        ${failed}`);
        console.log(`  Pending:       ${pending}`);
        console.log(`\n  Search plan for remaining days:`);
        for (let d = dayNumber; d <= cam.dailySearchQueries.length; d++) {
          const q = cam.dailySearchQueries[(d - 1) % cam.dailySearchQueries.length];
          console.log(chalk.dim(`    Day ${d}: "${q.keywords}"`));
        }
      } finally {
        await closeDatabase();
      }
    });

  campaign
    .command("list")
    .description("List all available campaigns")
    .action(() => {
      console.log(chalk.bold("\nAvailable campaigns:\n"));
      for (const name of listCampaigns()) {
        const cam = getCampaign(name);
        console.log(`  ${chalk.cyan(name)} — ${cam.dailySearchQueries.length} days, channels: ${cam.channels.join(", ")}`);
      }
      console.log();
    });

  campaign
    .command("plan")
    .description("Show the full campaign plan")
    .requiredOption("--campaign <name>", `Campaign name (${listCampaigns().join(", ")})`)
    .action((opts) => {
      const cam = getCampaign(opts.campaign);
      console.log(chalk.bold(`\nCampaign: ${cam.name} (${cam.dailySearchQueries.length} days)\n`));
      console.log(chalk.dim(`Channels: ${cam.channels.join(", ")}`));
      console.log(chalk.dim(`Angles: ${cam.messageAngles.join(", ")}\n`));
      for (let d = 1; d <= cam.dailySearchQueries.length; d++) {
        const q = cam.dailySearchQueries[(d - 1) % cam.dailySearchQueries.length];
        console.log(`  Day ${d.toString().padStart(2)}: ${chalk.cyan(q.keywords)}`);
        console.log(chalk.dim(`          Title: ${q.title}\n`));
      }
      console.log(chalk.dim(`Optimal send hours (UTC): ${JSON.stringify(cam.optimalHoursUtc)}\n`));
    });
}

async function detectDayNumber(accountId: string, campaignName: string): Promise<number> {
  const tags = await sql`
    SELECT DISTINCT tags FROM leads
    WHERE account_id = ${accountId} AND tags LIKE ${'%campaign-' + campaignName + '-d%'}
    ORDER BY tags DESC LIMIT 1
  `;

  if (tags.length === 0) return 1;

  const re = new RegExp(`campaign-${campaignName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-d(\\d+)`);
  const match = tags[0].tags.match(re);
  if (!match) return 1;

  return parseInt(match[1], 10) + 1;
}
