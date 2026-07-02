import { describe, it, expect } from "vitest";
import {
  makeUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
} from "../src/utils/unsubscribe.js";

describe("unsubscribe tokens", () => {
  it("round-trips a valid token back to the normalized email", () => {
    const token = makeUnsubscribeToken("Advocate@Example.COM");
    expect(verifyUnsubscribeToken(token)).toBe("advocate@example.com");
  });

  it("is deterministic (same email → same token)", () => {
    expect(makeUnsubscribeToken("a@b.ua")).toBe(makeUnsubscribeToken("a@b.ua"));
  });

  it("rejects a tampered payload", () => {
    const token = makeUnsubscribeToken("a@b.ua");
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("evil@x.ua").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("nodot")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
  });

  it("builds an unsubscribe URL carrying a valid token", () => {
    const url = unsubscribeUrl("x@y.ua");
    const token = decodeURIComponent(url.split("token=")[1]);
    expect(verifyUnsubscribeToken(token)).toBe("x@y.ua");
  });
});
