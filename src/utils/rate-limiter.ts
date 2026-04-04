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

export async function checkDailyLimit(
  accountId: string,
  actionType: string,
  limit: number
): Promise<boolean> {
  const current = await getDailyCount(accountId, actionType);
  return current < limit;
}

export function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= appConfig.businessHoursStart && hour < appConfig.businessHoursEnd;
}
