import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { syncLeads } from "../../core/leads.js";
import { syncConversations } from "../../core/conversations.js";
import { syncPosts } from "../../core/posts.js";
import { getAccountOption } from "../cli.js";
import { resolveAccountName, resolveAccountId, getAccounts } from "../../config.js";
import chalk from "chalk";

export function registerSyncCommand(parent: Command): void {
  const sync = parent
    .command("sync")
    .description("Sync data from LinkedIn");

  sync
    .command("leads")
    .description("Sync connections/leads from LinkedIn")
    .action(async function (this: Command) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.dim(`Account: ${accountName}\n`));

        const count = await syncLeads(account);
        console.log(chalk.green(`\nSynced ${count} leads.`));
      } finally {
        await closeDatabase();
      }
    });

  sync
    .command("conversations")
    .description("Sync conversations and messages from LinkedIn")
    .option("--limit <n>", "Max conversations to sync", "1000")
    .option("--no-messages", "Skip syncing messages, only sync chat list")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.dim(`Account: ${accountName}\n`));

        const result = await syncConversations({
          accountAlias: account,
          limit: parseInt(opts.limit, 10),
          syncMessages: opts.messages !== false,
        });
        console.log(
          chalk.green(`\nSynced ${result.chats} conversations, ${result.messages} messages.`)
        );
      } finally {
        await closeDatabase();
      }
    });

  sync
    .command("posts")
    .description("Sync posts from LinkedIn")
    .option("--limit <n>", "Max posts to sync", "500")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.dim(`Account: ${accountName}\n`));

        const count = await syncPosts({
          accountAlias: account,
          limit: parseInt(opts.limit, 10),
        });
        console.log(chalk.green(`\nSynced ${count} posts.`));
      } finally {
        await closeDatabase();
      }
    });

  sync
    .command("all")
    .description("Sync leads, conversations, and posts from all accounts")
    .option("--limit <n>", "Max conversations per account", "1000")
    .action(async function (this: Command, opts) {
      await initDatabase();
      try {
        const accounts = getAccounts();
        for (const acc of accounts) {
          console.log(chalk.bold(`\n=== ${acc.name} (${acc.alias}) ===\n`));

          const leadCount = await syncLeads(acc.alias);
          console.log(chalk.green(`  Leads: ${leadCount}`));

          const convResult = await syncConversations({
            accountAlias: acc.alias,
            limit: parseInt(opts.limit, 10),
            syncMessages: true,
          });
          console.log(
            chalk.green(`  Conversations: ${convResult.chats}, Messages: ${convResult.messages}`)
          );

          const postCount = await syncPosts({ accountAlias: acc.alias });
          console.log(chalk.green(`  Posts: ${postCount}`));
        }
        console.log(chalk.bold("\nAll accounts synced."));
      } finally {
        await closeDatabase();
      }
    });
}
