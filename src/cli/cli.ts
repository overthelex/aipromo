import { Command } from "commander";
import { registerInboxCommand } from "./commands/inbox.command.js";
import { registerRespondCommand } from "./commands/respond.command.js";
import { registerLeadsCommand } from "./commands/leads.command.js";
import { registerOutreachCommand } from "./commands/outreach.command.js";
import { registerConfigCommand } from "./commands/config.command.js";
import { registerSyncCommand } from "./commands/sync.command.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("aipromo")
    .description("LinkedIn lead response automation with AI")
    .version("1.0.0")
    .option("-a, --account <alias>", "LinkedIn account alias (e.g. ihor, vladimir)");

  registerSyncCommand(program);
  registerInboxCommand(program);
  registerRespondCommand(program);
  registerLeadsCommand(program);
  registerOutreachCommand(program);
  registerConfigCommand(program);

  return program;
}

export function getAccountOption(cmd: Command): string | undefined {
  // Walk up to root program to get global --account option
  let current: Command | null = cmd;
  while (current) {
    const opts = current.opts();
    if (opts.account) return opts.account;
    current = current.parent;
  }
  return undefined;
}
