import { logger } from "./logger.js";
import { sleep } from "./rate-limiter.js";

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      // Don't retry 422 errors — they are client errors that won't resolve on retry
      // (e.g. LinkedIn "cannot_resend_yet", "already_invited_recently")
      if (error.message?.includes("422")) throw error;

      if (attempt === maxRetries) throw error;

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      logger.warn(
        { attempt: attempt + 1, maxRetries, delay, label },
        `Retry after error`
      );
      await sleep(delay);
    }
  }

  throw new Error("Unreachable");
}
