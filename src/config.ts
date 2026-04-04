import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const configSchema = z.object({
  // PostgreSQL
  databaseUrl: z.string().min(1),

  // Unipile
  unipileDsn: z.string().min(1),
  unipileAccessToken: z.string().min(1),
  unipileAccountId: z.string().min(1),

  // AWS Bedrock
  awsAccessKeyId: z.string().min(1),
  awsSecretAccessKey: z.string().min(1),
  awsRegion: z.string().default("eu-central-1"),
  bedrockModel: z.string().default("eu.anthropic.claude-sonnet-4-6"),

  // Rate Limits
  maxMessagesPerDay: z.coerce.number().int().positive().default(50),
  maxInvitationsPerDay: z.coerce.number().int().positive().default(20),
  minDelaySeconds: z.coerce.number().positive().default(3),
  maxDelaySeconds: z.coerce.number().positive().default(8),
  businessHoursStart: z.coerce.number().int().min(0).max(23).default(9),
  businessHoursEnd: z.coerce.number().int().min(0).max(23).default(18),

  // Persona
  senderName: z.string().default(""),
  senderCompany: z.string().default(""),
  senderRole: z.string().default(""),
  campaignObjective: z.string().default("Book a discovery call"),
});

export type AppConfig = z.infer<typeof configSchema>;

function loadConfig(): AppConfig {
  const raw = {
    databaseUrl: process.env.DATABASE_URL,
    unipileDsn: process.env.UNIPILE_DSN,
    unipileAccessToken: process.env.UNIPILE_ACCESS_TOKEN,
    unipileAccountId: process.env.UNIPILE_ACCOUNT_ID,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION,
    bedrockModel: process.env.BEDROCK_MODEL,
    maxMessagesPerDay: process.env.MAX_MESSAGES_PER_DAY,
    maxInvitationsPerDay: process.env.MAX_INVITATIONS_PER_DAY,
    minDelaySeconds: process.env.MIN_DELAY_SECONDS,
    maxDelaySeconds: process.env.MAX_DELAY_SECONDS,
    businessHoursStart: process.env.BUSINESS_HOURS_START,
    businessHoursEnd: process.env.BUSINESS_HOURS_END,
    senderName: process.env.SENDER_NAME,
    senderCompany: process.env.SENDER_COMPANY,
    senderRole: process.env.SENDER_ROLE,
    campaignObjective: process.env.CAMPAIGN_OBJECTIVE,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    console.error(
      `\nConfiguration error. Missing or invalid: ${missing}\n` +
        `Copy .env.example to .env and fill in your API keys:\n` +
        `  cp .env.example .env\n`
    );
    process.exit(1);
  }

  return result.data;
}

export const appConfig = loadConfig();
