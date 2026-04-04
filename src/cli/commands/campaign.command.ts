import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { runCampaignDay } from "../../campaigns/engine.js";
import { DAILY_SEARCH_QUERIES, CAMPAIGN_NAME } from "../../campaigns/registry-access-2w.js";
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
    .description("Run one day of the registry-access campaign")
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
        console.log(chalk.dim(`Account: ${accountName}`));

        // Auto-detect day number from campaign start
        let dayNumber = opts.day ? parseInt(opts.day, 10) : await detectDayNumber(accountId);

        if (dayNumber > 14) {
          console.log(chalk.yellow("Campaign completed (14 days). Use --day to override."));
          return;
        }

        const result = await runCampaignDay({
          accountAlias: account,
          dayNumber,
          maxNewLeads: parseInt(opts.maxLeads, 10),
          maxMessages: parseInt(opts.maxMessages, 10),
          dryRun: opts.dryRun ?? false,
        });

        console.log(chalk.bold(`\n=== Day ${dayNumber} Summary ===`));
        console.log(`  Leads found:      ${result.searched}`);
        console.log(`  Messages sent:    ${result.messaged}`);
        console.log(`  Replies handled:  ${result.replied}`);
      } finally {
        await closeDatabase();
      }
    });

  campaign
    .command("status")
    .description("Show campaign progress")
    .action(async function (this: Command) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.bold(`Campaign: ${CAMPAIGN_NAME}`));
        console.log(chalk.dim(`Account: ${accountName}\n`));

        // Total leads tagged for campaign
        const [leadCount] = await sql`
          SELECT COUNT(*) as count FROM leads
          WHERE account_id = ${accountId} AND tags LIKE ${'%campaign-' + CAMPAIGN_NAME + '%'}
        `;

        // Messages sent
        const [campaign] = await sql`
          SELECT id FROM outreach_campaigns
          WHERE account_id = ${accountId} AND name = ${CAMPAIGN_NAME}
        `;

        let sent = 0, failed = 0, pending = 0;
        if (campaign) {
          const [counts] = await sql`
            SELECT
              COUNT(*) FILTER (WHERE status = 'sent') as sent,
              COUNT(*) FILTER (WHERE status = 'failed') as failed,
              COUNT(*) FILTER (WHERE status = 'pending') as pending
            FROM outreach_queue WHERE campaign_id = ${campaign.id}
          `;
          sent = Number(counts.sent);
          failed = Number(counts.failed);
          pending = Number(counts.pending);
        }

        const dayNumber = await detectDayNumber(accountId);

        console.log(`  Day:           ${dayNumber}/14`);
        console.log(`  Leads found:   ${Number(leadCount.count)}`);
        console.log(`  Sent:          ${sent}`);
        console.log(`  Failed:        ${failed}`);
        console.log(`  Pending:       ${pending}`);
        console.log(`\n  Search plan for remaining days:`);
        for (let d = dayNumber; d <= 14; d++) {
          const q = DAILY_SEARCH_QUERIES[(d - 1) % DAILY_SEARCH_QUERIES.length];
          console.log(chalk.dim(`    Day ${d}: "${q.keywords}"`));
        }
      } finally {
        await closeDatabase();
      }
    });

  campaign
    .command("plan")
    .description("Show the full 14-day campaign plan")
    .action(() => {
      console.log(chalk.bold(`\n📋 Campaign: ${CAMPAIGN_NAME} (14 days)\n`));
      for (let d = 1; d <= 14; d++) {
        const q = DAILY_SEARCH_QUERIES[(d - 1) % DAILY_SEARCH_QUERIES.length];
        console.log(`  Day ${d.toString().padStart(2)}: ${chalk.cyan(q.keywords)}`);
        console.log(chalk.dim(`          Title: ${q.title}\n`));
      }
      console.log(chalk.dim(`Optimal send hours (UTC): ${JSON.stringify([6, 7, 8, 10, 14, 15])}`));
      console.log(chalk.dim(`= Kyiv time: 8-10, 12, 16-17\n`));
    });
}

async function detectDayNumber(accountId: string): Promise<number> {
  const tags = await sql`
    SELECT DISTINCT tags FROM leads
    WHERE account_id = ${accountId} AND tags LIKE ${'%campaign-' + CAMPAIGN_NAME + '-d%'}
    ORDER BY tags DESC LIMIT 1
  `;

  if (tags.length === 0) return 1;

  const match = tags[0].tags.match(/campaign-registry-access-2w-d(\d+)/);
  if (!match) return 1;

  return parseInt(match[1], 10) + 1;
}
