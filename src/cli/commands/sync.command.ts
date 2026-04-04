import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { syncLeads } from "../../core/leads.js";
import { syncConversations } from "../../core/conversations.js";
import { syncPosts, syncCompanyPosts } from "../../core/posts.js";
import { getAccountOption } from "../cli.js";
import { resolveAccountName, resolveAccountId, getAccounts, appConfig } from "../../config.js";
import chalk from "chalk";

function getCompanyIds(): string[] {
  return appConfig.linkedinCompanyIds
    ? appConfig.linkedinCompanyIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

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
    .description("Sync personal posts from LinkedIn")
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
        console.log(chalk.green(`\nSynced ${count} personal posts.`));
      } finally {
        await closeDatabase();
      }
    });

  sync
    .command("company-posts")
    .description("Sync company page posts from LinkedIn")
    .option("--company-id <id>", "LinkedIn company ID (defaults to LINKEDIN_COMPANY_IDS from .env)")
    .option("--limit <n>", "Max posts to sync", "500")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);

        const companyIds = opts.companyId ? [opts.companyId] : getCompanyIds();
        if (companyIds.length === 0) {
          console.log(chalk.red("No company IDs configured. Set LINKEDIN_COMPANY_IDS in .env or use --company-id."));
          return;
        }

        for (const companyId of companyIds) {
          console.log(chalk.dim(`Account: ${accountName}, Company: ${companyId}\n`));
          const count = await syncCompanyPosts({
            accountAlias: account,
            companyId,
            limit: parseInt(opts.limit, 10),
          });
          console.log(chalk.green(`\nSynced ${count} company posts (${companyId}).`));
        }
      } finally {
        await closeDatabase();
      }
    });

  sync
    .command("all")
    .description("Sync leads, conversations, posts, and company posts from all accounts")
    .option("--limit <n>", "Max conversations per account", "1000")
    .action(async function (this: Command, opts) {
      await initDatabase();
      try {
        const accounts = getAccounts();
        const companyIds = getCompanyIds();

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
          console.log(chalk.green(`  Personal posts: ${postCount}`));

          for (const companyId of companyIds) {
            const companyCount = await syncCompanyPosts({
              accountAlias: acc.alias,
              companyId,
            });
            console.log(chalk.green(`  Company posts (${companyId}): ${companyCount}`));
          }
        }
        console.log(chalk.bold("\nAll accounts synced."));
      } finally {
        await closeDatabase();
      }
    });
}
