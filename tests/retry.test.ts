import { describe, it, expect } from "vitest";
import { withRetry } from "../src/utils/retry.js";

describe("withRetry", () => {
  it("succeeds on first try", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    }, "test");
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on failure", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "recovered";
      },
      "test",
      { maxRetries: 3, baseDelayMs: 10 }
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("throws after max retries", async () => {
    await expect(
      withRetry(
        async () => { throw new Error("always fail"); },
        "test",
        { maxRetries: 2, baseDelayMs: 10 }
      )
    ).rejects.toThrow("always fail");
  });
});
