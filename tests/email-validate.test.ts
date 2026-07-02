import { describe, it, expect } from "vitest";
import { validateSyntax } from "../src/utils/email-validate.js";

describe("email syntax validation", () => {
  it("accepts normal addresses", () => {
    expect(validateSyntax("ivan@law.ua")).toBe(true);
    expect(validateSyntax("a.b+c@sub.example.co.uk")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "no-at", "a@b", "a@@b.ua", "a b@c.ua", "a@b.", "@b.ua"]) {
      expect(validateSyntax(bad)).toBe(false);
    }
  });
});
