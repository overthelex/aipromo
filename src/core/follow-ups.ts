import chalk from "chalk";
import { sql } from "../storage/store.js";
import { UnipileService } from "../services/unipile.service.js";
import { ClaudeService } from "../services/claude.service.js";
import { checkAndIncrementDaily, checkPerMinuteLimit, sleep } from "../utils/rate-limiter.js";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import type { CampaignConfig } from "../campaigns/types.js";

function randomDelay(min: number, max: number): number {
  return (min + Math.random() * (max - min)) * 1000;
}

export async function processDueFollowUps(campaign: CampaignConfig, accountAlias?: string): Promise<number> {
  const unipile = new UnipileService(accountAlias);
  const accountId = unipile.accountId;
  const claude = new ClaudeService();

  const due = await sql`
    SELECT f.*, l.name, l.headline, l.linkedin_id, l.company, l.title
    FROM follow_ups f
    JOIN leads l ON f.lead_id = l.id
    JOIN outreach_campaigns oc ON f.campaign_id = oc.id
    WHERE f.account_id = ${accountId}
      AND f.status = 'pending'
      AND f.scheduled_for <= NOW()
      AND oc.name = ${campaign.name}
    ORDER BY f.scheduled_for ASC
    LIMIT 20
  `;

  if (due.length === 0) return 0;

  console.log(chalk.bold(`Processing ${due.length} due follow-ups...\n`));
  let sentCount = 0;

  for (const fu of due) {
    const canSend = await checkAndIncrementDaily(accountId, "message", appConfig.maxMessagesPerDay);
    if (!canSend) {
      console.log(chalk.yellow("  Daily limit reached. Stopping."));
      break;
    }

    if (!checkPerMinuteLimit(`msg:${accountId}`, 5)) {
      await sleep(30000);
    }

    const [lead] = await sql`SELECT status FROM leads WHERE id = ${fu.lead_id}`;
    if (lead && lead.status !== 'contacted') {
      await sql`UPDATE follow_ups SET status = 'cancelled' WHERE id = ${fu.id}`;
      console.log(chalk.dim(`  Skip ${fu.name} — status: ${lead.status}`));
      continue;
    }

    const convs = await sql`
      SELECT chat_id FROM conversations
      WHERE account_id = ${accountId} AND attendee_provider_id = ${fu.linkedin_id}
      LIMIT 1
    `;

    const systemPrompt = `You are writing a follow-up LinkedIn message for the ${campaign.name} campaign.
${campaign.productContext}
This is follow-up #${fu.step}. The lead was contacted before but hasn't replied.
RULES:
- Write in Ukrainian
- 2-3 sentences MAX
- Don't repeat the original pitch
- Be respectful of their time
- Step 1: gentle reminder, add new value
- Step 2: different angle, share a success story
- Step 3: last attempt, offer something specific (demo, trial)
- Output ONLY the message text`;

    const userPrompt = `Lead: ${fu.name}, ${fu.headline || ''}, ${fu.company || ''}
Follow-up step: ${fu.step} of 3
Generate a follow-up message.`;

    const message = await claude.generateWithSystem(systemPrompt, userPrompt);

    try {
      if (convs.length > 0) {
        await unipile.sendMessage(convs[0].chat_id, message);
      } else {
        await unipile.startChat(fu.linkedin_id, message);
      }

      await sql`UPDATE follow_ups SET status = 'sent', message_text = ${message}, sent_at = NOW() WHERE id = ${fu.id}`;
      sentCount++;
      console.log(chalk.green(`  ✓ Follow-up #${fu.step} to ${fu.name}`));
      await sleep(randomDelay(10, 25));
    } catch (err: any) {
      await sql`UPDATE follow_ups SET status = 'failed' WHERE id = ${fu.id}`;
      logger.error({ lead: fu.name, error: err.message }, "Follow-up failed");
      console.log(chalk.red(`  ✗ ${fu.name}: ${err.message}`));
    }
  }

  return sentCount;
}
