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

  // Google OAuth2
  googleClientId: z.string().default(""),
  googleClientSecret: z.string().default(""),
  googleCallbackUrl: z.string().default(""),

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
  // Steady-state daily email cap. Kept at 80/day to match the declared SES
  // use-case (<100/day, individual correspondence — not bulk/marketing).
  maxEmailsPerDay: z.coerce.number().int().positive().default(80),
  minDelaySeconds: z.coerce.number().positive().default(3),
  maxDelaySeconds: z.coerce.number().positive().default(8),
  businessHoursStart: z.coerce.number().int().min(0).max(23).default(9),
  businessHoursEnd: z.coerce.number().int().min(0).max(23).default(18),

  // SMTP (email client communication via own mail server)
  smtpHost: z.string().default(""),
  smtpPort: z.coerce.number().int().positive().default(587),
  // true = 465/implicit TLS, false = 587/STARTTLS. Parse "true"/"1"/"yes" only.
  smtpSecure: z
    .string()
    .optional()
    .transform((v) => /^(true|1|yes)$/i.test(v ?? "")),
  smtpUser: z.string().default(""),
  smtpPassword: z.string().default(""),
  smtpFromName: z.string().default(""),
  smtpFromEmail: z.string().default(""),
  smtpReplyTo: z.string().default(""),
  // Public base URL used to build one-click unsubscribe links (List-Unsubscribe)
  publicBaseUrl: z.string().default(""),
  // Secret used to sign unsubscribe tokens (HMAC)
  unsubscribeSecret: z.string().default(""),

  // --- SES relay reputation / warm-up ---
  // Region of the SES account the mail server relays through.
  sesRegion: z.string().default("eu-central-1"),
  // Warm-up: ramp new sending up to maxEmailsPerDay over the first days.
  emailWarmupEnabled: z
    .string()
    .optional()
    .transform((v) => v == null || /^(true|1|yes)$/i.test(v)),
  // ISO date (YYYY-MM-DD) sending started; day 0 = lowest ramp step.
  emailWarmupStartDate: z.string().default(""),
  // Reputation guard: abort campaigns if account rates exceed these (fractions).
  emailMaxBounceRate: z.coerce.number().min(0).max(1).default(0.05),
  emailMaxComplaintRate: z.coerce.number().min(0).max(1).default(0.001),
  // SNS topic that SES bounce/complaint notifications arrive on (webhook pins it).
  sesSnsTopicArn: z.string().default(""),

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
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
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
    maxEmailsPerDay: process.env.MAX_EMAILS_PER_DAY,
    minDelaySeconds: process.env.MIN_DELAY_SECONDS,
    maxDelaySeconds: process.env.MAX_DELAY_SECONDS,
    businessHoursStart: process.env.BUSINESS_HOURS_START,
    businessHoursEnd: process.env.BUSINESS_HOURS_END,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpFromName: process.env.SMTP_FROM_NAME,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL,
    smtpReplyTo: process.env.SMTP_REPLY_TO,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET,
    sesRegion: process.env.SES_REGION,
    emailWarmupEnabled: process.env.EMAIL_WARMUP_ENABLED,
    emailWarmupStartDate: process.env.EMAIL_WARMUP_START_DATE,
    emailMaxBounceRate: process.env.EMAIL_MAX_BOUNCE_RATE,
    emailMaxComplaintRate: process.env.EMAIL_MAX_COMPLAINT_RATE,
    sesSnsTopicArn: process.env.SES_SNS_TOPIC_ARN,
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
