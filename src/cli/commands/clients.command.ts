import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { initDatabase, closeDatabase } from "../../storage/store.js";
import {
  importClientsFromOpendata,
  listClients,
  clientStats,
  sendClientEmail,
  runEmailCampaign,
  getWarmupStatus,
  validateNewClients,
  syncSuppressionList,
} from "../../core/clients.js";
import { EmailService } from "../../services/email.service.js";
import type { ClientSegment } from "../../types/client.types.js";

function parseSegment(v?: string): ClientSegment | undefined {
  if (!v) return undefined;
  if (v === "advocate" || v === "advocates") return "advocate";
  if (v === "law_firm" || v === "firm" || v === "firms") return "law_firm";
  throw new Error(`Unknown segment "${v}" (use: advocate | law_firm)`);
}

export function registerClientsCommand(parent: Command): void {
  const clients = parent
    .command("clients")
    .description("Manage open-data email clients (advocates / law firms)");

  clients
    .command("import")
    .description("Import clients from open-data tables into email_clients")
    .option("--segment <s>", "advocate | law_firm | all", "all")
    .option("--tag <tag>", "Tag imported rows")
    .option("--limit <n>", "Max rows to import")
    .action(async (opts) => {
      await initDatabase();
      try {
        const segments: ClientSegment[] =
          opts.segment === "all"
            ? ["advocate", "law_firm"]
            : [parseSegment(opts.segment)!];
        for (const segment of segments) {
          const r = await importClientsFromOpendata({
            segment,
            tag: opts.tag,
            limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
          });
          console.log(
            chalk.green(
              `[${r.segment}] imported ${r.inserted} new (source had ${r.totalWithEmail} with email)`
            )
          );
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exitCode = 1;
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("stats")
    .description("Show client counts by segment/status")
    .action(async () => {
      await initDatabase();
      try {
        const rows = await clientStats();
        if (rows.length === 0) return console.log(chalk.yellow("No clients yet."));
        for (const r of rows) {
          console.log(`${chalk.bold(r.segment)} / ${r.status}: ${chalk.cyan(r.count)}`);
        }
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("list")
    .description("List clients")
    .option("--segment <s>", "advocate | law_firm")
    .option("--status <s>", "new | contacted | replied | bounced | unsubscribed")
    .option("--tag <tag>", "Filter by tag")
    .option("--limit <n>", "Max rows", "50")
    .action(async (opts) => {
      await initDatabase();
      try {
        const rows = await listClients({
          segment: parseSegment(opts.segment),
          status: opts.status,
          tag: opts.tag,
          limit: parseInt(opts.limit, 10),
        });
        if (rows.length === 0) return console.log(chalk.yellow("No clients found."));
        for (const c of rows) {
          console.log(
            `${chalk.bold(c.name || "(no name)")} <${c.email}>` +
              (c.org ? ` — ${c.org}` : "") +
              chalk.dim(` [${c.segment}/${c.status}]`)
          );
        }
        console.log(chalk.dim(`\nTotal: ${rows.length}`));
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("warmup-status")
    .description("Show warm-up cap, SES quota and reputation gate")
    .action(async () => {
      await initDatabase();
      try {
        const s = await getWarmupStatus();
        const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
        console.log(chalk.bold("Warm-up"));
        console.log(`  enabled: ${s.warmupEnabled}  day: ${s.day}`);
        console.log(
          `  warmup cap: ${s.warmupCap}  steady: ${s.steadyCap}  ` +
            chalk.bold(`effective: ${s.effectiveCap}`)
        );
        console.log(`  sent today: ${s.sentToday}  remaining: ${chalk.cyan(s.remainingToday)}`);
        console.log(chalk.bold("SES reputation"));
        console.log(
          `  sendingEnabled: ${s.reputation.sendingEnabled}  enforcement: ${s.reputation.enforcementStatus}`
        );
        console.log(
          `  24h quota: ${s.reputation.sentLast24Hours}/${s.reputation.max24HourSend}  rate: ${s.reputation.maxSendRate}/s`
        );
        console.log(
          `  bounce: ${pct(s.reputation.bounceRate)}  complaint: ${pct(s.reputation.complaintRate)}`
        );
        console.log(
          s.reputationOk
            ? chalk.green("  gate: OK — safe to send")
            : chalk.red(`  gate: BLOCKED — ${s.reputationReason}`)
        );
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exitCode = 1;
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("validate")
    .description("Pre-check 'new' clients (syntax + MX), flag undeliverable as invalid")
    .option("--limit <n>", "Max rows to check", "1000")
    .action(async (opts) => {
      await initDatabase();
      try {
        const r = await validateNewClients(parseInt(opts.limit, 10));
        console.log(
          chalk.green(`Checked ${r.checked}`) + chalk.dim(` · flagged invalid ${r.invalid}`)
        );
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("sync-suppression")
    .description("Pull SES suppression list and flag matching clients as bounced")
    .action(async () => {
      await initDatabase();
      try {
        const r = await syncSuppressionList();
        console.log(chalk.green(`Flagged ${r.flagged} clients as bounced`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exitCode = 1;
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("verify-smtp")
    .description("Check SMTP connectivity/auth without sending")
    .action(async () => {
      try {
        await new EmailService().verify();
        console.log(chalk.green("SMTP OK"));
      } catch (e: any) {
        console.error(chalk.red(`SMTP failed: ${e.message}`));
        process.exitCode = 1;
      }
    });

  clients
    .command("send <clientId>")
    .description("Send one personal email to a client")
    .requiredOption("--subject <s>", "Email subject (supports {{name}} {{org}})")
    .option("--body <text>", "Email body text")
    .option("--body-file <path>", "Read body from file")
    .action(async (clientId: string, opts) => {
      const body = opts.bodyFile ? readFileSync(opts.bodyFile, "utf-8") : opts.body;
      if (!body) {
        console.error(chalk.red("Provide --body or --body-file"));
        process.exitCode = 1;
        return;
      }
      await initDatabase();
      try {
        await sendClientEmail(parseInt(clientId, 10), opts.subject, body);
        console.log(chalk.green(`Sent to client #${clientId}`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exitCode = 1;
      } finally {
        await closeDatabase();
      }
    });

  clients
    .command("campaign")
    .description("Send a personal email campaign to 'new' clients (rate-limited)")
    .requiredOption("--subject <s>", "Subject (supports {{name}} {{org}})")
    .option("--body <text>", "Body text (supports {{name}} {{first_name}} {{org}})")
    .option("--body-file <path>", "Read body from file")
    .option("--segment <s>", "advocate | law_firm")
    .option("--tag <tag>", "Only clients with this tag")
    .option("--limit <n>", "Max emails this run", "50")
    .option("--personalize", "Rewrite each email with Claude", false)
    .option("--force", "Ignore business-hours gate", false)
    .action(async (opts) => {
      const body = opts.bodyFile ? readFileSync(opts.bodyFile, "utf-8") : opts.body;
      if (!body) {
        console.error(chalk.red("Provide --body or --body-file"));
        process.exitCode = 1;
        return;
      }
      await initDatabase();
      try {
        const r = await runEmailCampaign({
          subject: opts.subject,
          body,
          segment: parseSegment(opts.segment),
          tag: opts.tag,
          limit: parseInt(opts.limit, 10),
          personalize: opts.personalize,
          ignoreBusinessHours: opts.force,
        });
        console.log(
          chalk.green(`Sent ${r.sent}`) +
            chalk.dim(` · skipped ${r.skipped} · failed ${r.failed}`) +
            (r.stoppedReason ? chalk.yellow(` · stopped: ${r.stoppedReason}`) : "")
        );
      } finally {
        await closeDatabase();
      }
    });
}
