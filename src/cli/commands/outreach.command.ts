import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import {
  startCampaign,
  pauseCampaign,
  listCampaigns,
  getCampaignStatus,
} from "../../core/outreach.js";
import chalk from "chalk";

export function registerOutreachCommand(parent: Command): void {
  const outreach = parent
    .command("outreach")
    .description("Manage outreach campaigns");

  outreach
    .command("start")
    .description("Start a new outreach campaign")
    .requiredOption("--template <name>", "Message template name")
    .requiredOption("--tag <tag>", "Target leads by tag")
    .option("--limit <n>", "Max leads to message", "25")
    .option("--dry-run", "Preview without sending")
    .action(async (opts) => {
      await initDatabase();
      try {
        await startCampaign({
          template: opts.template,
          tag: opts.tag,
          limit: parseInt(opts.limit, 10),
          dryRun: opts.dryRun ?? false,
        });
      } finally {
        await closeDatabase();
      }
    });

  outreach
    .command("pause <campaignId>")
    .description("Pause an active campaign")
    .action(async (campaignId: string) => {
      await initDatabase();
      try {
        await pauseCampaign(parseInt(campaignId, 10));
        console.log(chalk.yellow(`Campaign ${campaignId} paused.`));
      } finally {
        await closeDatabase();
      }
    });

  outreach
    .command("list")
    .description("List all campaigns")
    .action(async () => {
      await initDatabase();
      try {
        const campaigns = await listCampaigns();
        if (campaigns.length === 0) {
          console.log(chalk.yellow("No campaigns."));
          return;
        }
        for (const c of campaigns) {
          const color = c.status === "active" ? chalk.green : chalk.gray;
          console.log(`${color(c.status.toUpperCase())} ${chalk.bold(c.name)} — tag: ${c.targetTags}`);
        }
      } finally {
        await closeDatabase();
      }
    });

  outreach
    .command("status <campaignId>")
    .description("Show campaign status")
    .action(async (campaignId: string) => {
      await initDatabase();
      try {
        const status = await getCampaignStatus(parseInt(campaignId, 10));
        console.log(`Campaign: ${chalk.bold(status.name)}`);
        console.log(`Status: ${status.status}`);
        console.log(`Sent: ${status.sent} / ${status.total}`);
        console.log(`Failed: ${status.failed}`);
        console.log(`Pending: ${status.pending}`);
      } finally {
        await closeDatabase();
      }
    });
}
