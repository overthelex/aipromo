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

export async function getDailyCount(actionType: string): Promise<number> {
  const rows = await sql`
    SELECT count FROM daily_activity
    WHERE date = CURRENT_DATE AND action_type = ${actionType}
  `;
  return rows.length > 0 ? rows[0].count : 0;
}

export async function incrementDailyCount(actionType: string): Promise<void> {
  await sql`
    INSERT INTO daily_activity (date, action_type, count)
    VALUES (CURRENT_DATE, ${actionType}, 1)
    ON CONFLICT (date, action_type)
    DO UPDATE SET count = daily_activity.count + 1
  `;
}

export async function checkDailyLimit(
  actionType: string,
  limit: number
): Promise<boolean> {
  const current = await getDailyCount(actionType);
  return current < limit;
}

export function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= appConfig.businessHoursStart && hour < appConfig.businessHoursEnd;
}
