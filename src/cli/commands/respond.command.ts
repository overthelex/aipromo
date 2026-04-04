import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { runResponder } from "../../core/responder.js";
import { getAccountOption } from "../cli.js";
import { resolveAccountName, resolveAccountId } from "../../config.js";
import chalk from "chalk";

export function registerRespondCommand(parent: Command): void {
  parent
    .command("respond")
    .description("Generate AI responses and send with approval")
    .option("--dry-run", "Generate drafts without sending")
    .option("--limit <n>", "Max conversations to process", "10")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.dim(`Account: ${accountName}\n`));

        await runResponder({
          dryRun: opts.dryRun ?? false,
          limit: parseInt(opts.limit, 10),
          accountAlias: account,
        });
      } finally {
        await closeDatabase();
      }
    });
}
