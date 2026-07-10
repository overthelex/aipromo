import { sql } from "../storage/store.js";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { EmailService } from "../services/email.service.js";
import { ClaudeService } from "../services/claude.service.js";
import { SesService } from "../services/ses.service.js";
import { validateEmail } from "../utils/email-validate.js";
import {
  checkAndIncrementDaily,
  getDailyCount,
  isBusinessHours,
  checkPerMinuteLimit,
  sleepWithJitter,
} from "../utils/rate-limiter.js";
import { addTag } from "../utils/tags.js";
import type { EmailClient, ClientSegment } from "../types/client.types.js";

// Warm-up ramp: gradually raise the daily cap to the steady-state
// maxEmailsPerDay so a freshly-active sender doesn't spike volume (which SES
// and inbox providers read as spam). Values are daily caps by day index.
const WARMUP_RAMP = [20, 20, 40, 40, 60, 60, 80];

function daysSince(startDate: string): number {
  if (!startDate) return WARMUP_RAMP.length; // no start date → treat as warmed up
  const start = Date.parse(startDate + "T00:00:00Z");
  if (Number.isNaN(start)) return WARMUP_RAMP.length;
  const ms = Date.now() - start;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// Today's warm-up cap (before applying the configured steady maxEmailsPerDay).
export function warmupCapForToday(): number {
  if (!appConfig.emailWarmupEnabled) return appConfig.maxEmailsPerDay;
  const day = daysSince(appConfig.emailWarmupStartDate);
  const ramp = day < WARMUP_RAMP.length ? WARMUP_RAMP[day] : WARMUP_RAMP[WARMUP_RAMP.length - 1];
  return Math.min(ramp, appConfig.maxEmailsPerDay);
}

export interface WarmupStatus {
  warmupEnabled: boolean;
  day: number;
  warmupCap: number;
  steadyCap: number;
  effectiveCap: number;
  sentToday: number;
  remainingToday: number;
  reputation: Awaited<ReturnType<SesService["getReputation"]>>;
  reputationOk: boolean;
  reputationReason?: string;
}

function accountKey(): string {
  return appConfig.smtpFromEmail || appConfig.smtpUser || "email";
}

// Reputation guard: is it safe to send right now?
function checkReputation(
  rep: Awaited<ReturnType<SesService["getReputation"]>>
): { ok: boolean; reason?: string } {
  if (!rep.sendingEnabled) return { ok: false, reason: "SES sending disabled" };
  if (rep.enforcementStatus && rep.enforcementStatus !== "HEALTHY")
    return { ok: false, reason: `SES enforcement: ${rep.enforcementStatus}` };
  if (rep.bounceRate > appConfig.emailMaxBounceRate)
    return {
      ok: false,
      reason: `bounce rate ${(rep.bounceRate * 100).toFixed(2)}% > ${(appConfig.emailMaxBounceRate * 100).toFixed(2)}%`,
    };
  if (rep.complaintRate > appConfig.emailMaxComplaintRate)
    return {
      ok: false,
      reason: `complaint rate ${(rep.complaintRate * 100).toFixed(3)}% > ${(appConfig.emailMaxComplaintRate * 100).toFixed(3)}%`,
    };
  return { ok: true };
}

export async function getWarmupStatus(): Promise<WarmupStatus> {
  const rep = await new SesService().getReputation();
  const warmupCap = warmupCapForToday();
  const sentToday = await getDailyCount(accountKey(), "email_sent");
  const rc = checkReputation(rep);
  const effectiveCap = Math.min(
    warmupCap,
    appConfig.maxEmailsPerDay,
    Math.max(0, Math.floor(rep.max24HourSend - rep.sentLast24Hours))
  );
  return {
    warmupEnabled: appConfig.emailWarmupEnabled,
    day: daysSince(appConfig.emailWarmupStartDate),
    warmupCap,
    steadyCap: appConfig.maxEmailsPerDay,
    effectiveCap,
    sentToday,
    remainingToday: Math.max(0, effectiveCap - sentToday),
    reputation: rep,
    reputationOk: rc.ok,
    reputationReason: rc.reason,
  };
}

export interface ValidateResult {
  checked: number;
  invalid: number;
}

// Pre-validate 'new' clients (syntax + MX) and flag undeliverable ones so they
// never enter a campaign. This is the main lever against SES bounce-rate limits.
export async function validateNewClients(limit: number): Promise<ValidateResult> {
  const rows = await sql`
    SELECT id, email FROM email_clients
    WHERE status = 'new'
    ORDER BY imported_at ASC
    LIMIT ${limit}
  `;
  let invalid = 0;
  for (const r of rows) {
    const v = await validateEmail(r.email);
    if (!v.valid) {
      invalid++;
      await sql`
        UPDATE email_clients SET status = 'invalid', tags = ${addTag("", "invalid:" + (v.reason ?? "unknown"))}
        WHERE id = ${r.id} AND status = 'new'
      `;
    }
  }
  logger.info({ checked: rows.length, invalid }, "Validated new clients");
  return { checked: rows.length, invalid };
}

// Pull SES account-level suppression list and flag matching clients 'bounced'
// so we never resend to addresses SES already refuses.
export async function syncSuppressionList(): Promise<{ flagged: number }> {
  const list = await new SesService().listSuppressed();
  let flagged = 0;
  for (const s of list) {
    if (!s.EmailAddress) continue;
    const res = await sql`
      UPDATE email_clients SET status = 'bounced'
      WHERE lower(email) = ${s.EmailAddress.toLowerCase()}
        AND status NOT IN ('bounced', 'unsubscribed')
      RETURNING id
    `;
    flagged += res.length;
  }
  logger.info({ suppressed: list.length, flagged }, "Synced SES suppression list");
  return { flagged };
}

// Open-data source tables and the column each field is likely to live under.
// Column names are auto-detected against information_schema, so imports work
// even if the advocates table has a slightly different layout than firms.
const SOURCE_TABLES: Record<ClientSegment, string> = {
  advocate: "opendata_advocates",
  law_firm: "opendata_law_firms",
};

const FIELD_CANDIDATES: Record<string, string[]> = {
  email: ["email", "e_mail", "mail"],
  name: ["name", "full_name", "fio", "pib", "advocate_name", "lawyer_name"],
  org: ["org", "organization", "firm_name", "company", "name"],
  edrpou: ["edrpou", "code", "edrpou_code"],
  phone: ["phone", "tel", "telephone", "phone_number"],
  website: ["website", "site", "url", "web"],
  region: ["region", "oblast", "city", "area", "location"],
};

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

async function detectColumns(table: string): Promise<Record<string, string>> {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  const present = new Set(rows.map((r) => r.column_name.toLowerCase()));
  const resolved: Record<string, string> = {};
  for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
    const hit = candidates.find((c) => present.has(c));
    if (hit && IDENT_RE.test(hit)) resolved[field] = hit;
  }
  return resolved;
}

export interface ImportOptions {
  segment: ClientSegment;
  limit?: number;
  tag?: string;
}

export interface ImportResult {
  segment: ClientSegment;
  inserted: number;
  totalWithEmail: number;
}

// Bulk-import open-data contacts into email_clients. Set-based INSERT ... SELECT
// for speed on tens of thousands of rows; dedup by lower(email); never clobbers
// existing rows (so status/tags/unsubscribes survive re-imports).
export async function importClientsFromOpendata(
  opts: ImportOptions
): Promise<ImportResult> {
  const table = SOURCE_TABLES[opts.segment];
  if (!table) throw new Error(`Unknown segment: ${opts.segment}`);

  const cols = await detectColumns(table);
  if (!cols.email) {
    throw new Error(`Table ${table} has no detectable email column`);
  }

  // Build SELECT expressions from detected columns (all identifiers validated).
  const expr = (field: string, fallback = "''") =>
    cols[field] ? `NULLIF(TRIM(${cols[field]}::text), '')` : fallback;

  const segment = opts.segment;
  const tagStr = opts.tag ? addTag("", opts.tag) : "";
  const limitClause = opts.limit ? `LIMIT ${Math.floor(opts.limit)}` : "";

  const selectSql = `
    SELECT
      lower(TRIM(${cols.email}::text)) AS email,
      COALESCE(${expr("name")}, '') AS name,
      COALESCE(${expr("org")}, '') AS org,
      COALESCE(${expr("edrpou")}, '') AS edrpou,
      COALESCE(${expr("phone")}, '') AS phone,
      COALESCE(${expr("website")}, '') AS website,
      COALESCE(${expr("region")}, '') AS region
    FROM public.${table}
    WHERE ${cols.email} IS NOT NULL
      AND TRIM(${cols.email}::text) <> ''
      AND position('@' in ${cols.email}::text) > 1
    ${limitClause}
  `;

  const totalRow = await sql.unsafe(
    `SELECT count(*)::int AS n FROM public.${table}
     WHERE ${cols.email} IS NOT NULL AND TRIM(${cols.email}::text) <> ''`
  );
  const totalWithEmail = totalRow[0]?.n ?? 0;

  const before = await sql`SELECT count(*)::int AS n FROM email_clients WHERE segment = ${segment}`;

  await sql.unsafe(
    `INSERT INTO email_clients (email, name, org, edrpou, phone, website, region, segment, tags, source)
     SELECT DISTINCT ON (email)
       email, name, org, edrpou, phone, website, region,
       $1 AS segment, $2 AS tags, $3 AS source
     FROM ( ${selectSql} ) src
     ORDER BY email
     ON CONFLICT (lower(email)) DO NOTHING`,
    [segment, tagStr, table]
  );

  const after = await sql`SELECT count(*)::int AS n FROM email_clients WHERE segment = ${segment}`;
  const inserted = (after[0].n as number) - (before[0].n as number);

  logger.info({ segment, table, inserted, totalWithEmail }, "Clients imported from open data");
  return { segment, inserted, totalWithEmail };
}

function mapClient(r: any): EmailClient {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    org: r.org,
    edrpou: r.edrpou,
    phone: r.phone,
    website: r.website,
    region: r.region,
    segment: r.segment,
    tags: r.tags,
    status: r.status,
    source: r.source,
    unsubscribeToken: r.unsubscribe_token,
    lastContactedAt: r.last_contacted_at,
    unsubscribedAt: r.unsubscribed_at,
    importedAt: r.imported_at,
  };
}

export interface ListClientsOptions {
  segment?: ClientSegment;
  status?: string;
  tag?: string;
  sort?: string;
  dir?: "asc" | "desc";
  limit: number;
}

// Whitelist of sortable columns (maps UI keys → real column names).
const SORT_COLUMNS: Record<string, string> = {
  name: "name",
  email: "email",
  org: "org",
  region: "region",
  segment: "segment",
  status: "status",
  last: "last_contacted_at",
};

export async function listClients(opts: ListClientsOptions): Promise<EmailClient[]> {
  // Build a safe ORDER BY from the whitelist; default = most recently imported.
  const col = opts.sort ? SORT_COLUMNS[opts.sort] : undefined;
  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const orderBy = col
    ? `ORDER BY ${col} ${dir} NULLS LAST, imported_at DESC`
    : `ORDER BY imported_at DESC`;

  const rows = await sql`
    SELECT * FROM email_clients
    WHERE (${opts.segment ?? null}::text IS NULL OR segment = ${opts.segment ?? null})
      AND (${opts.status ?? null}::text IS NULL OR status = ${opts.status ?? null})
      AND (${opts.tag ?? null}::text IS NULL OR tags LIKE ${"%" + (opts.tag ?? "") + "%"})
    ${sql.unsafe(orderBy)}
    LIMIT ${opts.limit}
  `;
  return rows.map(mapClient);
}

// Distinct tags across all clients (tags column is comma-separated), with counts.
export async function listClientTags(): Promise<Array<{ tag: string; count: number }>> {
  const rows = await sql`
    SELECT trim(tg) AS tag, count(*)::int AS count
    FROM email_clients, unnest(string_to_array(tags, ',')) AS tg
    WHERE trim(tg) <> ''
    GROUP BY trim(tg)
    ORDER BY count DESC, tag ASC
  `;
  return rows.map((r: any) => ({ tag: r.tag, count: r.count }));
}

export async function clientStats(): Promise<
  Array<{ segment: string; status: string; count: number }>
> {
  const rows = await sql`
    SELECT segment, status, count(*)::int AS count
    FROM email_clients
    GROUP BY segment, status
    ORDER BY segment, status
  `;
  return rows.map((r: any) => ({ segment: r.segment, status: r.status, count: r.count }));
}

function render(template: string, client: EmailClient): string {
  const firstName = (client.name || "").trim().split(/\s+/)[0] || "";
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, client.name || "")
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*org\s*\}\}/gi, client.org || "")
    .replace(/\{\{\s*email\s*\}\}/gi, client.email);
}

const EMAIL_SYSTEM_PROMPT = [
  "Ти — помічник юриста, який пише коротке персональне ділове email-звернення українською мовою.",
  "Пиши ввічливо, професійно, без спаму та надмірних обіцянок. Звертайся на «Ви».",
  "Поверни ЛИШЕ текст листа, без теми, без підпису-плейсхолдерів і без лапок.",
].join(" ");

// Send one personal email to a client, log it, and advance status.
export async function sendClientEmail(
  clientId: number,
  subject: string,
  body: string,
  emailSvc?: EmailService
): Promise<void> {
  const rows = await sql`SELECT * FROM email_clients WHERE id = ${clientId}`;
  if (rows.length === 0) throw new Error(`Client not found: ${clientId}`);
  const client = mapClient(rows[0]);

  if (client.status === "unsubscribed") {
    throw new Error(`Client ${client.email} is unsubscribed`);
  }

  const svc = emailSvc ?? new EmailService();
  const subj = render(subject, client);
  const text = render(body, client);

  try {
    const { messageId } = await svc.send({
      to: client.email,
      subject: subj,
      text,
      unsubscribeFor: client.email,
    });
    await sql`
      INSERT INTO email_messages (client_id, direction, subject, body, message_id, status)
      VALUES (${clientId}, 'outbound', ${subj}, ${text}, ${messageId}, 'sent')
    `;
    await sql`
      UPDATE email_clients
      SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
          last_contacted_at = NOW()
      WHERE id = ${clientId}
    `;
  } catch (err: any) {
    await sql`
      INSERT INTO email_messages (client_id, direction, subject, body, status, error)
      VALUES (${clientId}, 'outbound', ${subj}, ${text}, 'error', ${String(err?.message ?? err)})
    `;
    throw err;
  }
}

export interface CampaignOptions {
  subject: string;
  body: string;
  segment?: ClientSegment;
  tag?: string;
  limit: number;
  personalize?: boolean;
  ignoreBusinessHours?: boolean;
}

export interface CampaignResult {
  sent: number;
  skipped: number;
  failed: number;
  effectiveCap?: number;
  stoppedReason?: string;
}

// Drive a personal email campaign over `new` clients with the same daily caps,
// business-hours and throttling rules the LinkedIn outreach engine uses — plus
// SES reputation gating, warm-up caps, address validation and suppression skip.
export async function runEmailCampaign(opts: CampaignOptions): Promise<CampaignResult> {
  const key = accountKey();
  const svc = new EmailService();
  const ses = new SesService();
  const claude = opts.personalize ? new ClaudeService() : null;

  const result: CampaignResult = { sent: 0, skipped: 0, failed: 0 };

  if (!opts.ignoreBusinessHours && !isBusinessHours()) {
    result.stoppedReason = "outside business hours";
    return result;
  }

  // Reputation gate — refuse to send if the SES account is unhealthy.
  const rep = await ses.getReputation();
  const rc = checkReputation(rep);
  if (!rc.ok) {
    result.stoppedReason = `reputation gate: ${rc.reason}`;
    logger.warn({ rep }, "Campaign blocked by reputation gate");
    return result;
  }

  // Effective cap = min(steady cap, today's warm-up cap, SES 24h headroom).
  const effectiveCap = Math.min(
    appConfig.maxEmailsPerDay,
    warmupCapForToday(),
    Math.max(0, Math.floor(rep.max24HourSend - rep.sentLast24Hours))
  );
  result.effectiveCap = effectiveCap;
  if (effectiveCap <= 0) {
    result.stoppedReason = "daily cap already reached";
    return result;
  }

  const candidates = await sql`
    SELECT * FROM email_clients
    WHERE status = 'new'
      AND (${opts.segment ?? null}::text IS NULL OR segment = ${opts.segment ?? null})
      AND (${opts.tag ?? null}::text IS NULL OR tags LIKE ${"%" + (opts.tag ?? "") + "%"})
    ORDER BY imported_at ASC
    LIMIT ${opts.limit}
  `;

  for (const row of candidates) {
    const client = mapClient(row);

    // Skip & flag undeliverable addresses before they can bounce.
    const v = await validateEmail(client.email);
    if (!v.valid) {
      await sql`UPDATE email_clients SET status = 'invalid' WHERE id = ${client.id} AND status = 'new'`;
      result.skipped++;
      continue;
    }
    if (await ses.isSuppressed(client.email)) {
      await sql`UPDATE email_clients SET status = 'bounced' WHERE id = ${client.id} AND status = 'new'`;
      result.skipped++;
      continue;
    }

    if (!checkPerMinuteLimit(`email:${key}`, 10)) {
      await sleepWithJitter();
    }

    // Atomic daily cap per sending mailbox, bounded by the warm-up effective cap.
    const allowed = await checkAndIncrementDaily(key, "email_sent", effectiveCap);
    if (!allowed) {
      result.stoppedReason = "daily email limit reached";
      break;
    }

    let body = opts.body;
    if (claude) {
      try {
        const userPrompt = [
          `Отримувач: ${client.name || client.email}${client.org ? `, ${client.org}` : ""}.`,
          `Сегмент: ${client.segment === "law_firm" ? "юридична фірма" : "адвокат"}.`,
          ``,
          `Чернетка/шаблон листа:`,
          render(opts.body, client),
          ``,
          `Перепиши як природний персональний лист саме цьому отримувачу. Лише текст листа.`,
        ].join("\n");
        body = await claude.generateWithSystem(EMAIL_SYSTEM_PROMPT, userPrompt);
      } catch (e) {
        logger.warn({ email: client.email }, "Personalization failed, using template");
      }
    }

    try {
      await sendClientEmail(client.id, opts.subject, body, svc);
      result.sent++;
    } catch (e: any) {
      result.failed++;
      logger.warn({ email: client.email, err: String(e?.message ?? e) }, "Email send failed");
    }

    await sleepWithJitter();
  }

  logger.info(result, "Email campaign finished");
  return result;
}

// --- SES bounce/complaint notifications (via SNS webhook) ---

interface SesNotification {
  notificationType?: string;
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: Array<{ emailAddress?: string }>;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
  };
  mail?: { messageId?: string };
}

async function flagClient(
  email: string,
  status: "bounced" | "complained",
  detail: string,
  messageId: string
): Promise<boolean> {
  const norm = email.trim().toLowerCase();
  const rows = await sql`
    UPDATE email_clients SET status = ${status}
    WHERE lower(email) = ${norm}
      AND status NOT IN ('unsubscribed', 'bounced', 'complained')
    RETURNING id
  `;
  await sql`
    INSERT INTO email_messages (client_id, direction, subject, body, message_id, status, error)
    VALUES (
      ${rows[0]?.id ?? null}, 'inbound', ${status}, '', ${messageId},
      ${status}, ${detail}
    )
  `;
  return rows.length > 0;
}

// Apply a parsed SES notification: permanent bounces → 'bounced',
// complaints → 'complained'. Transient bounces are logged but not flagged.
export async function applySesNotification(
  notification: SesNotification
): Promise<{ type: string; flagged: number }> {
  const type = notification.notificationType ?? "Unknown";
  const messageId = notification.mail?.messageId ?? "";
  let flagged = 0;

  if (type === "Bounce" && notification.bounce) {
    const permanent = notification.bounce.bounceType === "Permanent";
    for (const r of notification.bounce.bouncedRecipients ?? []) {
      if (!r.emailAddress) continue;
      if (permanent) {
        if (await flagClient(r.emailAddress, "bounced", notification.bounce.bounceType ?? "", messageId))
          flagged++;
      } else {
        logger.info({ email: r.emailAddress, type: notification.bounce.bounceType }, "Transient bounce (not flagged)");
      }
    }
  } else if (type === "Complaint" && notification.complaint) {
    for (const r of notification.complaint.complainedRecipients ?? []) {
      if (!r.emailAddress) continue;
      if (await flagClient(r.emailAddress, "complained", "complaint", messageId)) flagged++;
    }
  }

  logger.info({ type, flagged }, "Applied SES notification");
  return { type, flagged };
}

// Flag a client as unsubscribed (called from the public /unsubscribe route).
export async function unsubscribeByEmail(email: string): Promise<boolean> {
  const rows = await sql`
    UPDATE email_clients
    SET status = 'unsubscribed', unsubscribed_at = NOW()
    WHERE lower(email) = ${email.trim().toLowerCase()}
    RETURNING id
  `;
  return rows.length > 0;
}
