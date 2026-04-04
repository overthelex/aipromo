import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { syncLeads, importLeadsFromCsv, listLeads, tagLead } from "../../core/leads.js";
import { getAccountOption } from "../cli.js";
import { resolveAccountName, resolveAccountId } from "../../config.js";
import chalk from "chalk";

export function registerLeadsCommand(parent: Command): void {
  const leads = parent
    .command("leads")
    .description("Manage LinkedIn leads");

  leads
    .command("sync")
    .description("Sync connections from LinkedIn")
    .action(async function (this: Command) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.dim(`Account: ${accountName}\n`));

        const count = await syncLeads(account);
        console.log(chalk.green(`Synced ${count} leads from LinkedIn.`));
      } finally {
        await closeDatabase();
      }
    });

  leads
    .command("import <file>")
    .description("Import leads from CSV")
    .action(async (file: string) => {
      await initDatabase();
      try {
        const count = await importLeadsFromCsv(file);
        console.log(chalk.green(`Imported ${count} leads from ${file}.`));
      } finally {
        await closeDatabase();
      }
    });

  leads
    .command("list")
    .description("List leads")
    .option("--tag <tag>", "Filter by tag")
    .option("--company <company>", "Filter by company")
    .option("--limit <n>", "Max leads to show", "50")
    .action(async (opts) => {
      await initDatabase();
      try {
        const result = await listLeads({
          tag: opts.tag,
          company: opts.company,
          limit: parseInt(opts.limit, 10),
        });

        if (result.length === 0) {
          console.log(chalk.yellow("No leads found."));
          return;
        }

        for (const lead of result) {
          console.log(
            `${chalk.bold(lead.name)} — ${lead.title} @ ${lead.company}` +
            (lead.tags ? chalk.cyan(` [${lead.tags}]`) : "")
          );
        }
        console.log(chalk.dim(`\nTotal: ${result.length}`));
      } finally {
        await closeDatabase();
      }
    });

  leads
    .command("tag <linkedinId> <tag>")
    .description("Add a tag to a lead")
    .action(async (linkedinId: string, tag: string) => {
      await initDatabase();
      try {
        await tagLead(linkedinId, tag);
        console.log(chalk.green(`Tagged ${linkedinId} with "${tag}".`));
      } finally {
        await closeDatabase();
      }
    });
}
