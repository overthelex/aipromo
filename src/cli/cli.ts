import { Command } from "commander";
import { registerInboxCommand } from "./commands/inbox.command.js";
import { registerRespondCommand } from "./commands/respond.command.js";
import { registerLeadsCommand } from "./commands/leads.command.js";
import { registerOutreachCommand } from "./commands/outreach.command.js";
import { registerConfigCommand } from "./commands/config.command.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("aipromo")
    .description("LinkedIn lead response automation with AI")
    .version("1.0.0");

  registerInboxCommand(program);
  registerRespondCommand(program);
  registerLeadsCommand(program);
  registerOutreachCommand(program);
  registerConfigCommand(program);

  return program;
}
