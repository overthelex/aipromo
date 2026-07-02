import { resolveMx } from "node:dns/promises";

export interface EmailValidation {
  valid: boolean;
  reason?: string;
}

// Reasonable syntax check (not full RFC 5322 — deliberately conservative).
const SYNTAX_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// Per-domain MX cache — registry data repeats domains heavily, so one lookup
// per domain saves tens of thousands of DNS queries on a 60k import.
const mxCache = new Map<string, boolean>();

export function validateSyntax(email: string): boolean {
  return SYNTAX_RE.test(email.trim());
}

async function domainHasMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const records = await resolveMx(domain);
    ok = records.length > 0 && records.some((r) => r.exchange);
  } catch {
    ok = false; // NXDOMAIN / no MX / SERVFAIL → treat as undeliverable
  }
  mxCache.set(domain, ok);
  return ok;
}

// Full check: syntax + the domain actually has mail exchangers.
// This is what cuts the bounce rate on stale registry addresses.
export async function validateEmail(email: string): Promise<EmailValidation> {
  const addr = email.trim().toLowerCase();
  if (!validateSyntax(addr)) return { valid: false, reason: "syntax" };
  const domain = addr.slice(addr.lastIndexOf("@") + 1);
  if (!(await domainHasMx(domain))) return { valid: false, reason: "no_mx" };
  return { valid: true };
}
