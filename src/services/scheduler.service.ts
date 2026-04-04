import PQueue from "p-queue";
import { appConfig } from "../config.js";
import { isBusinessHours, sleepWithJitter } from "../utils/rate-limiter.js";
import { logger } from "../utils/logger.js";

const queue = new PQueue({ concurrency: 1 });

export async function scheduleTask<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  return queue.add(async () => {
    if (!isBusinessHours()) {
      logger.warn({ label }, "Outside business hours, delaying task");
    }
    await sleepWithJitter();
    return fn();
  }) as Promise<T>;
}

export function getQueueSize(): number {
  return queue.size + queue.pending;
}
