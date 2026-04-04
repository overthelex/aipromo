import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { runResponder } from "../../core/responder.js";

export function registerRespondCommand(parent: Command): void {
  parent
    .command("respond")
    .description("Generate AI responses and send with approval")
    .option("--dry-run", "Generate drafts without sending")
    .option("--limit <n>", "Max conversations to process", "10")
    .action(async (opts) => {
      await initDatabase();
      try {
        await runResponder({
          dryRun: opts.dryRun ?? false,
          limit: parseInt(opts.limit, 10),
        });
      } finally {
        await closeDatabase();
      }
    });
}
