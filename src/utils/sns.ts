import { createVerify } from "node:crypto";
import { logger } from "../utils/logger.js";

// Amazon SNS HTTP(S) message. We only type the fields we use.
export interface SnsMessage {
  Type: string;
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  SubscribeURL?: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
}

// Fields (in this exact order) that make up the string-to-sign, per SNS docs.
const SIGN_FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
  UnsubscribeConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
};

export function buildStringToSign(msg: SnsMessage): string {
  const fields = SIGN_FIELDS[msg.Type];
  if (!fields) throw new Error(`Unknown SNS message type: ${msg.Type}`);
  let out = "";
  for (const f of fields) {
    const v = (msg as any)[f];
    if (v === undefined || v === null) continue; // Subject is optional
    out += `${f}\n${v}\n`;
  }
  return out;
}

// Only fetch signing certs from genuine AWS SNS hosts (SSRF guard).
function isValidCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname) &&
      u.pathname.endsWith(".pem")
    );
  } catch {
    return false;
  }
}

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string | null> {
  if (!isValidCertUrl(url)) {
    logger.warn({ url }, "Rejected SNS SigningCertURL");
    return null;
  }
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

// Verify the RSA signature over the canonical string-to-sign.
export async function verifySnsMessage(msg: SnsMessage): Promise<boolean> {
  try {
    const cert = await fetchCert(msg.SigningCertURL);
    if (!cert) return false;
    const algo = msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
    const verifier = createVerify(algo);
    verifier.update(buildStringToSign(msg), "utf8");
    verifier.end();
    return verifier.verify(cert, msg.Signature, "base64");
  } catch (e) {
    logger.warn({ err: String(e) }, "SNS signature verification error");
    return false;
  }
}

// Confirm an HTTP(S) subscription by GETting the SubscribeURL (validated host).
export async function confirmSubscription(msg: SnsMessage): Promise<boolean> {
  if (!msg.SubscribeURL) return false;
  try {
    const u = new URL(msg.SubscribeURL);
    if (u.protocol !== "https:" || !/\.amazonaws\.com$/.test(u.hostname)) {
      logger.warn({ url: msg.SubscribeURL }, "Rejected SNS SubscribeURL");
      return false;
    }
    const res = await fetch(msg.SubscribeURL, { signal: AbortSignal.timeout(10000) });
    logger.info({ status: res.status }, "SNS subscription confirmed");
    return res.ok;
  } catch (e) {
    logger.warn({ err: String(e) }, "SNS subscription confirm failed");
    return false;
  }
}
