import express from "express";
import { createServer, IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { sql, initDatabase, closeDatabase } from "./storage/store.js";
import { logger } from "./utils/logger.js";
import { apiRouter } from "./web/api.js";
import { authRouter, authMiddleware, seedUsers } from "./web/auth.js";
import { appConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
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

// Login page
app.get("/login", (_req, res) => {
  res.sendFile(join(__dirname, "web/public/login.html"));
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
const PAGES = ["dashboard", "leads", "conversations", "messages", "outreach", "campaigns", "posts", "search", "sync", "activity", "analytics", "pipeline", "deals", "follow-ups"];
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
const PORT = parseInt(process.env.PORT ?? "8080", 10);

async function start() {
  await initDatabase();
  await seedUsers();
  server.listen(PORT, () => {
    logger.info({ port: PORT }, "aipromo server started (HTTP + WS)");
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
