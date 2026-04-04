import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { fetchInbox } from "../../core/inbox.js";
import chalk from "chalk";

export function registerInboxCommand(parent: Command): void {
  parent
    .command("inbox")
    .description("Show unread/unanswered LinkedIn messages")
    .option("--unread-only", "Show only unread messages")
    .option("--limit <n>", "Max conversations to show", "20")
    .action(async (opts) => {
      await initDatabase();
      try {
        const conversations = await fetchInbox({
          unreadOnly: opts.unreadOnly ?? false,
          limit: parseInt(opts.limit, 10),
        });

        if (conversations.length === 0) {
          console.log(chalk.green("No unanswered messages."));
          return;
        }

        for (const conv of conversations) {
          const status = conv.unreadCount > 0 ? chalk.red("NEW") : chalk.gray("read");
          console.log(
            `${status} ${chalk.bold(conv.attendeeName)} — ${chalk.dim(conv.lastMessagePreview)}`
          );
          console.log(chalk.dim(`   ${conv.lastMessageAt}\n`));
        }

        console.log(chalk.dim(`Total: ${conversations.length} conversations`));
      } finally {
        await closeDatabase();
      }
    });
}
