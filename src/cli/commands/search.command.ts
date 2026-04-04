import { Command } from "commander";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import { searchLeads, lookupSearchParam } from "../../core/search.js";
import { getAccountOption } from "../cli.js";
import { resolveAccountName, resolveAccountId } from "../../config.js";
import chalk from "chalk";

export function registerSearchCommand(parent: Command): void {
  const search = parent
    .command("search")
    .description("Search for LinkedIn leads");

  search
    .command("leads")
    .description("Search LinkedIn for leads with filters")
    .requiredOption("--keywords <words>", "Search keywords")
    .option("--location <ids...>", "Location IDs (use 'search lookup' to find)")
    .option("--seniority <levels...>", "Seniority levels: 1=Training, 2=Entry, 3=Senior, 4=Manager, 5=Director, 6=VP, 7=CXO, 8=Partner, 9=Owner")
    .option("--industry <ids...>", "Industry IDs")
    .option("--title <title>", "Job title filter")
    .option("--company <ids...>", "Company IDs")
    .option("--limit <n>", "Max results", "25")
    .option("--save", "Save results to leads database")
    .option("--tag <tag>", "Tag to apply when saving", "search")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      await initDatabase();
      try {
        const accountId = resolveAccountId(account);
        const accountName = resolveAccountName(accountId);
        console.log(chalk.dim(`Account: ${accountName}\n`));

        const results = await searchLeads({
          accountAlias: account,
          keywords: opts.keywords,
          location: opts.location,
          seniority: opts.seniority,
          industry: opts.industry,
          title: opts.title,
          company: opts.company,
          limit: parseInt(opts.limit, 10),
          save: opts.save ?? false,
          tag: opts.tag,
        });

        if (results.length === 0) {
          console.log(chalk.yellow("No results found."));
          return;
        }

        console.log("");
        for (const r of results) {
          const dist = r.networkDistance === "DISTANCE_1" ? chalk.green("1st")
            : r.networkDistance === "DISTANCE_2" ? chalk.yellow("2nd")
            : chalk.dim("3rd+");
          console.log(
            `${dist} ${chalk.bold(r.name)} — ${r.headline}`
          );
          console.log(chalk.dim(`     ${r.location} | ${r.id}\n`));
        }

        console.log(chalk.bold(`Found: ${results.length} leads`));
        if (opts.save) {
          console.log(chalk.green(`Saved to database with tag "${opts.tag}"`));
        }
      } finally {
        await closeDatabase();
      }
    });

  search
    .command("lookup")
    .description("Look up LinkedIn search parameter IDs")
    .requiredOption("--type <type>", "Parameter type: LOCATION, INDUSTRY, COMPANY, SCHOOL")
    .requiredOption("--keyword <keyword>", "Keyword to search for")
    .action(async function (this: Command, opts) {
      const account = getAccountOption(this);
      const results = await lookupSearchParam({
        accountAlias: account,
        type: opts.type,
        keyword: opts.keyword,
      });

      if (results.length === 0) {
        console.log(chalk.yellow("No results."));
        return;
      }

      for (const r of results) {
        console.log(`${chalk.bold(r.id)} — ${r.title}`);
      }
    });
}
