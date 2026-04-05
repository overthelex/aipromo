import { describe, it, expect } from "vitest";
import { checkPerMinuteLimit } from "../src/utils/rate-limiter.js";

describe("checkPerMinuteLimit", () => {
  it("allows up to limit", () => {
    const key = "test-" + Date.now();
    expect(checkPerMinuteLimit(key, 3)).toBe(true);
    expect(checkPerMinuteLimit(key, 3)).toBe(true);
    expect(checkPerMinuteLimit(key, 3)).toBe(true);
  });

  it("blocks over limit", () => {
    const key = "test-block-" + Date.now();
    checkPerMinuteLimit(key, 2);
    checkPerMinuteLimit(key, 2);
    expect(checkPerMinuteLimit(key, 2)).toBe(false);
  });

  it("different keys are independent", () => {
    const a = "key-a-" + Date.now();
    const b = "key-b-" + Date.now();
    checkPerMinuteLimit(a, 1);
    expect(checkPerMinuteLimit(a, 1)).toBe(false);
    expect(checkPerMinuteLimit(b, 1)).toBe(true);
  });
});
