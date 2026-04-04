import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

export interface AccountConfig {
  id: string;
  alias: string;
  name: string;
}

const configSchema = z.object({
  // PostgreSQL
  databaseUrl: z.string().min(1),

  // Dashboard auth
  dashboardApiKey: z.string().default(""),

  // Unipile
  unipileDsn: z.string().min(1),
  unipileAccessToken: z.string().min(1),
  // JSON array: [{"alias":"ihor","id":"xxx","name":"Ihor Kyrychenko"}, ...]
  unipileAccounts: z.string().min(1),
  unipileDefaultAccount: z.string().default(""),
  // LinkedIn company page IDs (comma-separated)
  linkedinCompanyIds: z.string().default(""),

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
    dashboardApiKey: process.env.DASHBOARD_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    unipileDsn: process.env.UNIPILE_DSN,
    unipileAccessToken: process.env.UNIPILE_ACCESS_TOKEN,
    unipileAccounts: process.env.UNIPILE_ACCOUNTS,
    unipileDefaultAccount: process.env.UNIPILE_DEFAULT_ACCOUNT,
    linkedinCompanyIds: process.env.LINKEDIN_COMPANY_IDS,
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

let _accounts: AccountConfig[] | null = null;

export function getAccounts(): AccountConfig[] {
  if (!_accounts) {
    _accounts = JSON.parse(appConfig.unipileAccounts) as AccountConfig[];
  }
  return _accounts;
}

export function resolveAccountId(aliasOrId?: string): string {
  const accounts = getAccounts();

  if (!aliasOrId) {
    if (appConfig.unipileDefaultAccount) {
      return resolveAccountId(appConfig.unipileDefaultAccount);
    }
    return accounts[0].id;
  }

  const found = accounts.find(
    (a) => a.alias === aliasOrId || a.id === aliasOrId
  );
  if (!found) {
    const available = accounts.map((a) => a.alias).join(", ");
    console.error(`Account "${aliasOrId}" not found. Available: ${available}`);
    process.exit(1);
  }
  return found.id;
}

export function resolveAccountName(accountId: string): string {
  const accounts = getAccounts();
  const found = accounts.find((a) => a.id === accountId);
  return found?.name ?? accountId;
}
