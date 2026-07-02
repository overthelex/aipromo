import { createHmac, timingSafeEqual } from "node:crypto";
import { appConfig } from "../config.js";

// Signed, self-verifying unsubscribe token: base64url(email) + "." + HMAC.
// No DB lookup needed to validate a link; the token also matches the value we
// persist on the client row so we can find & flag the recipient.
function secret(): string {
  return appConfig.unsubscribeSecret || appConfig.dashboardApiKey || "aipromo-unsub";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf-8"
  );
}

export function makeUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const payload = b64url(normalized);
  const sig = b64url(createHmac("sha256", secret()).update(normalized).digest());
  return `${payload}.${sig}`;
}

// Returns the normalized email if the token is valid, otherwise null.
export function verifyUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let email: string;
  try {
    email = fromB64url(parts[0]);
  } catch {
    return null;
  }
  const expected = makeUnsubscribeToken(email);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? email : null;
}

export function unsubscribeUrl(email: string): string {
  const base = (appConfig.publicBaseUrl || "").replace(/\/+$/, "");
  const token = makeUnsubscribeToken(email);
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}
