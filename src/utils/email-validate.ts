import { resolveMx } from "node:dns/promises";

export interface EmailValidation {
  valid: boolean;
  reason?: string;
}

// Reasonable syntax check (not full RFC 5322 — deliberately conservative).
const SYNTAX_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// TLDs we never mail (RU/SU — not a target audience, hurts sending reputation).
const BLOCKED_TLDS = [".ru", ".su"];

// Exact registrable domains we block: Russian webmail hosted on other TLDs +
// common disposable/throwaway providers. Matches the domain or any subdomain.
const BLOCKED_DOMAINS = new Set<string>([
  // Russian webmail (mail.ru/list.ru/bk.ru/inbox.ru are already .ru)
  "yandex.com",
  "yandex.by",
  "yandex.kz",
  "ya.ru",
  // Disposable / throwaway (curated subset of the most common)
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "sharklasers.com",
  "10minutemail.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "trashmail.com",
  "mailnesia.com",
  "mohmal.com",
  "emailondeck.com",
  "spam4.me",
]);

function isBlockedDomain(domain: string): boolean {
  if (BLOCKED_TLDS.some((tld) => domain.endsWith(tld))) return true;
  if (BLOCKED_DOMAINS.has(domain)) return true;
  // Subdomain of a blocked domain (e.g. foo.mailinator.com)
  for (const d of BLOCKED_DOMAINS) {
    if (domain.endsWith("." + d)) return true;
  }
  return false;
}

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

export { isBlockedDomain };

// Full check: syntax → domain blocklist (RU/SU + disposable) → MX records.
// This is what cuts the bounce rate on stale registry addresses and keeps us
// off domains we should never mail.
export async function validateEmail(email: string): Promise<EmailValidation> {
  const addr = email.trim().toLowerCase();
  if (!validateSyntax(addr)) return { valid: false, reason: "syntax" };
  const domain = addr.slice(addr.lastIndexOf("@") + 1);
  if (isBlockedDomain(domain)) return { valid: false, reason: "blocked" };
  if (!(await domainHasMx(domain))) return { valid: false, reason: "no_mx" };
  return { valid: true };
}
