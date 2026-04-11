import express from "express";
import { createServer, IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { sql, initDatabase, closeDatabase } from "./storage/store.js";
import { logger } from "./utils/logger.js";
import { apiRouter } from "./web/api.js";
import { authRouter, authMiddleware, seedUsers } from "./web/auth.js";
import { appConfig, getAccounts } from "./config.js";
import { processScheduledOutreach } from "./campaigns/engine.js";
import { UnipileService } from "./services/unipile.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", true); // Cloud Run terminates SSL
const server = createServer(app);

// --- WebSocket ---
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

const JWT_SECRET = appConfig.dashboardApiKey || "aipromo-default-secret";

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // Auth: check JWT from cookie or API key from query
  const cookies = req.headers.cookie?.split(";").reduce((acc, c) => {
    const [k, v] = c.trim().split("=");
    acc[k] = v;
    return acc;
  }, {} as Record<string, string>) || {};

  const token = cookies["aipromo_token"];
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const apiKey = url.searchParams.get("key");

  let authed = false;
  if (token) {
    try { jwt.verify(token, JWT_SECRET); authed = true; } catch {}
  }
  if (!authed && apiKey && appConfig.dashboardApiKey && apiKey === appConfig.dashboardApiKey) authed = true;

  if (!authed) { ws.close(4001, "Unauthorized"); return; }

  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

function broadcast(event: string, payload?: Record<string, unknown>) {
  const msg = JSON.stringify({ event, ...payload });
  for (const ws of clients) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    } catch {
      clients.delete(ws);
    }
  }
}

export { broadcast };

app.use(express.json());
app.use(cookieParser());

// Auth routes (login/logout/me)
app.use("/auth", authRouter);

// Auth middleware for all /api routes
app.use(authMiddleware);

// API routes
app.use("/api", apiRouter);

// Landing page (public homepage)
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "web/public/landing.html"));
});

// Login page
app.get("/login", (_req, res) => {
  res.sendFile(join(__dirname, "web/public/login.html"));
});

// Crawler detection
const CRAWLER_RE = /googlebot|bingbot|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|applebot|duckduckbot|ia_archiver|semrushbot|ahrefsbot|mj12bot/i;

function isCrawler(req: express.Request): boolean {
  return CRAWLER_RE.test(req.headers["user-agent"] || "");
}

// Blog (public, no auth) — serve pre-rendered HTML for crawlers
app.get("/blog", (req, res) => {
  if (!isCrawler(req)) {
    return res.sendFile(join(__dirname, "web/public/blog.html"));
  }
  // Serve a crawler-friendly version with article content inline
  try {
    const articlesPath = join(__dirname, "web/public/articles.json");
    const articles = JSON.parse(readFileSync(articlesPath, "utf-8")) as Array<{
      id: string; title: string; excerpt: string; content: string;
      date: string; readTime: string; tags: string[]; category: string;
    }>;
    const articlesList = articles.map(a =>
      `<article><h2><a href="/blog/${a.id}">${a.title}</a></h2><p>${a.excerpt}</p><time>${a.date}</time><span>${a.readTime}</span></article>`
    ).join("\n");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>selected.ai — Blog</title>
<meta name="description" content="How we built an AI-powered LinkedIn outreach engine — from architecture to conversion.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://selected.highfunk.uk/blog">
<meta property="og:title" content="selected.ai — Blog">
<meta property="og:description" content="How we built an AI-powered LinkedIn outreach engine — from architecture to conversion.">
<meta property="og:image" content="https://selected.highfunk.uk/og-image.png">
</head>
<body>
<h1>The selected.ai Blog</h1>
<p>How we built an AI-powered LinkedIn outreach engine — from architecture to conversion. For growth managers and engineers alike.</p>
${articlesList}
</body>
</html>`);
  } catch {
    res.sendFile(join(__dirname, "web/public/blog.html"));
  }
});

// Blog article page (public, no auth)
app.get("/blog/:slug", (req, res) => {
  const { slug } = req.params;
  try {
    const articlesPath = join(__dirname, "web/public/articles.json");
    const articles = JSON.parse(readFileSync(articlesPath, "utf-8")) as Array<{
      id: string; title: string; excerpt: string; content: string;
      title_ua?: string; excerpt_ua?: string; content_ua?: string;
      date: string; readTime: string; tags: string[]; category: string;
    }>;
    const article = articles.find(a => a.id === slug);
    if (!article) {
      return res.redirect("/blog");
    }

    if (!isCrawler(req)) {
      return res.sendFile(join(__dirname, "web/public/blog.html"));
    }

    // SSR for crawlers: full article HTML with structured data
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": article.title,
      "description": article.excerpt,
      "datePublished": article.date,
      "author": { "@type": "Organization", "name": "selected.ai", "url": "https://selected.highfunk.uk" },
      "publisher": { "@type": "Organization", "name": "selected.ai", "url": "https://selected.highfunk.uk" },
      "mainEntityOfPage": `https://selected.highfunk.uk/blog/${article.id}`,
      "keywords": article.tags.join(", "),
      "articleSection": article.category,
      "inLanguage": "en",
      ...(article.content_ua ? { "workTranslation": { "@type": "BlogPosting", "headline": article.title_ua, "inLanguage": "uk" } } : {}),
    });

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${article.title} — selected.ai Blog</title>
<meta name="description" content="${article.excerpt}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://selected.highfunk.uk/blog/${article.id}">
<meta property="og:title" content="${article.title} — selected.ai">
<meta property="og:description" content="${article.excerpt}">
<meta property="og:image" content="https://selected.highfunk.uk/og-image.png">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="uk_UA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${article.title} — selected.ai">
<meta name="twitter:description" content="${article.excerpt}">
<meta name="twitter:image" content="https://selected.highfunk.uk/og-image.png">
<link rel="canonical" href="https://selected.highfunk.uk/blog/${article.id}">
<link rel="alternate" hreflang="en" href="https://selected.highfunk.uk/blog/${article.id}">
<link rel="alternate" hreflang="uk" href="https://selected.highfunk.uk/blog/${article.id}">
<link rel="alternate" hreflang="x-default" href="https://selected.highfunk.uk/blog/${article.id}">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<nav><a href="/blog">&larr; Blog</a></nav>
<article>
<h1>${article.title}</h1>
<div class="meta"><time datetime="${article.date}">${article.date}</time> &middot; ${article.readTime} read</div>
<div class="tags">${article.tags.map(t => `<span>${t}</span>`).join(" ")}</div>
<div class="content">${article.content}</div>
</article>
</body>
</html>`);
  } catch {
    res.redirect("/blog");
  }
});

// Pitch deck — add crawler route so /pitch-deck works without .html
app.get("/pitch-deck", (req, res) => {
  res.sendFile(join(__dirname, "web/public/pitch-deck.html"));
});

// Serve static assets
app.use(express.static(join(__dirname, "web/public")));

// Health check (with DB ping)
app.get("/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error", detail: "database unreachable" });
  }
});

// SPA fallback
const PAGES = ["dashboard", "leads", "conversations", "messages", "outreach", "campaigns", "posts", "search", "sync", "activity", "analytics", "pipeline", "deals", "follow-ups", "chat"];
for (const p of PAGES) {
  app.get(`/${p}`, (_req, res) => {
    res.sendFile(join(__dirname, "web/public/index.html"));
  });
}

// Webhook: new message
app.post("/webhook/message", async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== "object" || !data.chat_id) {
      return res.json({ ok: true, skipped: true });
    }
    logger.info({ event: data.message_type || "message", chatId: data.chat_id }, "Webhook: message");

    const accountId = data.account_id ?? "";
    const chatId = data.chat_id ?? "";
    const messageId = data.message_id ?? data.provider_message_id ?? `wh-${Date.now()}`;
    const senderId = data.sender?.provider_id ?? data.sender?.id ?? "";
    const text = (data.message ?? "").replace(/\0/g, "");
    const isSender = Boolean(data.is_sender);
    const messageType = data.message_type ?? "WEBHOOK";
    const timestamp = data.timestamp ?? new Date().toISOString();
    const senderName = data.sender?.name ?? "";
    const chatContentType = data.chat_content_type ?? "";
    const folder = Array.isArray(data.folder) ? data.folder.join(",") : (data.folder ?? "");

    await sql`
      INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
      VALUES (NULL, ${messageId}, ${chatId}, ${senderId}, ${text}, ${isSender}, ${messageType}, ${timestamp}, false)
      ON CONFLICT (message_id) DO NOTHING
    `;

    if (chatId) {
      await sql`
        INSERT INTO conversations (account_id, chat_id, attendee_name, attendee_provider_id, content_type, folder, unread_count, last_message_at, status, synced_at)
        VALUES (${accountId}, ${chatId}, ${isSender ? '' : senderName}, ${isSender ? '' : senderId}, ${chatContentType}, ${folder}, ${isSender ? 0 : 1}, ${timestamp}, ${isSender ? 'read' : 'new'}, NOW())
        ON CONFLICT (chat_id)
        DO UPDATE SET
          last_message_at = ${timestamp},
          unread_count = CASE WHEN ${isSender} THEN 0 ELSE conversations.unread_count + 1 END,
          status = CASE WHEN ${isSender} THEN conversations.status ELSE 'new' END,
          synced_at = NOW()
      `;
    }

    // Auto-update lead status to 'responded' on incoming message
    if (!isSender && senderId) {
      await sql`
        UPDATE leads SET status = 'responded'
        WHERE linkedin_id = ${senderId} AND account_id = ${accountId} AND status = 'contacted'
      `;
      // Cancel pending follow-ups for this lead
      await sql`
        UPDATE follow_ups SET status = 'cancelled'
        WHERE account_id = ${accountId} AND status = 'pending'
          AND lead_id IN (SELECT id FROM leads WHERE linkedin_id = ${senderId} AND account_id = ${accountId})
      `;
    }

    broadcast("message", { chatId, accountId, senderId, senderName, text: text.slice(0, 100), isSender, messageType, timestamp });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ error: err.message }, "Webhook message processing failed");
    res.status(500).json({ error: err.message });
  }
});

// Webhook: new relation
app.post("/webhook/relation", async (req, res) => {
  try {
    const data = req.body;
    const accountId = data.account_id ?? "";
    const linkedinId = data.user_provider_id ?? "";
    const name = (data.user_full_name ?? "").replace(/\0/g, "");
    const profileUrl = data.user_profile_url ?? "";

    if (linkedinId) {
      await sql`
        INSERT INTO leads (account_id, linkedin_id, name, profile_url, source)
        VALUES (${accountId}, ${linkedinId}, ${name}, ${profileUrl}, 'webhook')
        ON CONFLICT (account_id, linkedin_id)
        DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name)
      `;
    }
    broadcast("relation", { accountId, linkedinId, name });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ error: err.message }, "Webhook relation processing failed");
    res.status(500).json({ error: err.message });
  }
});

// --- Graceful shutdown ---
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down");
  wss.close();
  server.close();
  await closeDatabase();
  process.exit(0);
});

// Start server
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// --- Scheduled outreach cron (every 10 min) ---
let cronRunning = false;

async function processScheduledCron() {
  if (cronRunning) return;
  cronRunning = true;
  try {
    for (const acc of getAccounts()) {
      const unipile = new UnipileService(acc.alias);
      const sent = await processScheduledOutreach(unipile, unipile.accountId);
      if (sent > 0) {
        logger.info({ account: acc.alias, sent }, "Cron: scheduled outreach sent");
        broadcast("campaign_log", { msg: `Cron: ${sent} scheduled messages sent for ${acc.alias}` });
      }
    }
  } catch (err: any) {
    logger.error({ error: err.message }, "Cron: scheduled outreach failed");
  } finally {
    cronRunning = false;
  }
}

async function start() {
  await initDatabase();
  await seedUsers();
  server.listen(PORT, () => {
    logger.info({ port: PORT }, "aipromo server started (HTTP + WS)");
    console.log(`Server running on port ${PORT}`);

    // Process scheduled outreach every 10 minutes
    setInterval(processScheduledCron, 10 * 60 * 1000);
    // Also run once on startup after 30s delay
    setTimeout(processScheduledCron, 30_000);
    logger.info("Scheduled outreach cron enabled (every 10 min)");
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
