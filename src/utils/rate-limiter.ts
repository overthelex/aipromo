import { sql } from "../storage/store.js";
import { appConfig } from "../config.js";

function randomDelay(): number {
  const { minDelaySeconds, maxDelaySeconds } = appConfig;
  const ms =
    (minDelaySeconds + Math.random() * (maxDelaySeconds - minDelaySeconds)) *
    1000;
  return Math.round(ms);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepWithJitter(): Promise<void> {
  await sleep(randomDelay());
}

export async function getDailyCount(accountId: string, actionType: string): Promise<number> {
  const rows = await sql`
    SELECT count FROM daily_activity
    WHERE account_id = ${accountId} AND date = CURRENT_DATE AND action_type = ${actionType}
  `;
  return rows.length > 0 ? rows[0].count : 0;
}

export async function incrementDailyCount(accountId: string, actionType: string): Promise<void> {
  await sql`
    INSERT INTO daily_activity (account_id, date, action_type, count)
    VALUES (${accountId}, CURRENT_DATE, ${actionType}, 1)
    ON CONFLICT (account_id, date, action_type)
    DO UPDATE SET count = daily_activity.count + 1
  `;
}

// Atomic check-and-increment: returns true if within limit
export async function checkAndIncrementDaily(
  accountId: string,
  actionType: string,
  limit: number
): Promise<boolean> {
  const result = await sql`
    INSERT INTO daily_activity (account_id, date, action_type, count)
    VALUES (${accountId}, CURRENT_DATE, ${actionType}, 1)
    ON CONFLICT (account_id, date, action_type)
    DO UPDATE SET count = daily_activity.count + 1
    WHERE daily_activity.count < ${limit}
    RETURNING count
  `;
  return result.length > 0;
}

export async function checkDailyLimit(
  accountId: string,
  actionType: string,
  limit: number
): Promise<boolean> {
  const current = await getDailyCount(accountId, actionType);
  return current < limit;
}

export function isBusinessHours(): boolean {
  const kyivTime = new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" });
  const hour = new Date(kyivTime).getHours();
  return hour >= appConfig.businessHoursStart && hour < appConfig.businessHoursEnd;
}

export async function isPublicHoliday(countryCode: string, date?: Date): Promise<boolean> {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const rows = await sql`
    SELECT 1 FROM public_holidays
    WHERE country_code = ${countryCode} AND date = ${dateStr}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function isWorkingDay(countryCode: string, date?: Date): Promise<boolean> {
  const d = date || new Date();
  const day = d.getDay();
  if (day === 0 || day === 6) return false; // weekend
  return !(await isPublicHoliday(countryCode, d));
}

// Per-minute rate limiting (in-memory sliding window)
const minuteWindows = new Map<string, number[]>();

export function checkPerMinuteLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const window = minuteWindows.get(key) || [];
  const recent = window.filter(t => now - t < 60_000);
  minuteWindows.set(key, recent);
  if (recent.length >= maxPerMinute) return false;
  recent.push(now);
  return true;
}
