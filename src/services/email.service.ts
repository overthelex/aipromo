import nodemailer, { type Transporter } from "nodemailer";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { unsubscribeUrl } from "../utils/unsubscribe.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // When set, adds List-Unsubscribe (one-click) headers + footer link.
  unsubscribeFor?: string;
}

export interface SendEmailResult {
  messageId: string;
}

let _transport: Transporter | null = null;

function getTransport(): Transporter {
  if (_transport) return _transport;

  if (!appConfig.smtpHost) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in your env."
    );
  }

  _transport = nodemailer.createTransport({
    host: appConfig.smtpHost,
    port: appConfig.smtpPort,
    secure: appConfig.smtpSecure, // 465 = true, 587/STARTTLS = false
    auth: appConfig.smtpUser
      ? { user: appConfig.smtpUser, pass: appConfig.smtpPassword }
      : undefined,
  });

  return _transport;
}

function fromHeader(): string {
  const name = appConfig.smtpFromName || appConfig.senderName || "";
  const addr = appConfig.smtpFromEmail || appConfig.smtpUser;
  if (!addr) throw new Error("SMTP_FROM_EMAIL / SMTP_USER not set");
  return name ? `"${name.replace(/"/g, "")}" <${addr}>` : addr;
}

export class EmailService {
  // Verify SMTP connectivity/auth without sending.
  async verify(): Promise<void> {
    await getTransport().verify();
    logger.info({ host: appConfig.smtpHost }, "SMTP connection verified");
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const transport = getTransport();

    const headers: Record<string, string> = {};
    let text = input.text;
    let html = input.html;

    if (input.unsubscribeFor && appConfig.publicBaseUrl) {
      const url = unsubscribeUrl(input.unsubscribeFor);
      headers["List-Unsubscribe"] = `<${url}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      text = `${text}\n\n—\nЩоб більше не отримувати листів, перейдіть за посиланням: ${url}`;
      if (html) {
        html = `${html}<hr><p style="font-size:12px;color:#888">Щоб більше не отримувати листів, <a href="${url}">відпишіться тут</a>.</p>`;
      }
    }

    const info = await transport.sendMail({
      from: fromHeader(),
      to: input.to,
      replyTo: appConfig.smtpReplyTo || undefined,
      subject: input.subject,
      text,
      html,
      headers,
    });

    logger.info({ to: input.to, messageId: info.messageId }, "Email sent");
    return { messageId: info.messageId };
  }
}
