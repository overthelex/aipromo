import { Command } from "commander";
import { appConfig } from "../../config.js";
import { UnipileService } from "../../services/unipile.service.js";
import { ClaudeService } from "../../services/claude.service.js";
import chalk from "chalk";

export function registerConfigCommand(parent: Command): void {
  const config = parent
    .command("config")
    .description("Configuration management");

  config
    .command("test")
    .description("Test API connections")
    .action(async () => {
      console.log(chalk.bold("Testing connections...\n"));

      // Test Unipile
      try {
        const unipile = new UnipileService();
        const accounts = await unipile.listAccounts();
        console.log(chalk.green(`Unipile: OK (${accounts.length} account(s))`));
      } catch (e: any) {
        console.log(chalk.red(`Unipile: FAILED — ${e.message}`));
      }

      // Test Claude
      try {
        const claude = new ClaudeService();
        await claude.ping();
        console.log(chalk.green(`Claude (Bedrock): OK (model: ${appConfig.bedrockModel})`));
      } catch (e: any) {
        console.log(chalk.red(`Claude API: FAILED — ${e.message}`));
      }
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const redact = (s: string) =>
        s.length > 8 ? s.slice(0, 4) + "****" + s.slice(-4) : "****";

      console.log(chalk.bold("Current configuration:\n"));
      console.log(`Unipile DSN:     ${appConfig.unipileDsn}`);
      console.log(`Unipile Token:   ${redact(appConfig.unipileAccessToken)}`);
      console.log(`Unipile Account: ${appConfig.unipileAccountId}`);
      console.log(`AWS Key:         ${redact(appConfig.awsAccessKeyId)}`);
      console.log(`AWS Region:      ${appConfig.awsRegion}`);
      console.log(`Bedrock Model:   ${appConfig.bedrockModel}`);
      console.log(`Database:        ${appConfig.databaseUrl.replace(/\/\/.*@/, "//***@")}`);
      console.log(`\nRate Limits:`);
      console.log(`  Messages/day:    ${appConfig.maxMessagesPerDay}`);
      console.log(`  Invitations/day: ${appConfig.maxInvitationsPerDay}`);
      console.log(`  Delay:           ${appConfig.minDelaySeconds}-${appConfig.maxDelaySeconds}s`);
      console.log(`  Business hours:  ${appConfig.businessHoursStart}:00-${appConfig.businessHoursEnd}:00`);
      console.log(`\nPersona:`);
      console.log(`  Name:      ${appConfig.senderName || "(not set)"}`);
      console.log(`  Company:   ${appConfig.senderCompany || "(not set)"}`);
      console.log(`  Role:      ${appConfig.senderRole || "(not set)"}`);
      console.log(`  Objective: ${appConfig.campaignObjective}`);
    });
}
