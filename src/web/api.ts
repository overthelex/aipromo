import { Router } from "express";
import { sql } from "../storage/store.js";
import { appConfig, getAccounts, resolveAccountId, resolveAccountName } from "../config.js";
import { UnipileService } from "../services/unipile.service.js";
import { ClaudeService } from "../services/claude.service.js";
import { syncLeads } from "../core/leads.js";
import { syncConversations } from "../core/conversations.js";
import { syncPosts, syncCompanyPosts } from "../core/posts.js";
import { searchLeads } from "../core/search.js";
import { runCampaignDay } from "../campaigns/engine.js";
import { CAMPAIGN_NAME, DAILY_SEARCH_QUERIES } from "../campaigns/registry-access-2w.js";
import { broadcast } from "../server.js";

export const apiRouter = Router();

// --- Dashboard Stats ---
apiRouter.get("/stats", async (_req, res) => {
  const [leads] = await sql`SELECT COUNT(*) as count FROM leads`;
  const [conversations] = await sql`SELECT COUNT(*) as count FROM conversations`;
  const [messages] = await sql`SELECT COUNT(*) as count FROM messages`;
  const [posts] = await sql`SELECT COUNT(*) as count FROM posts`;
  const [sentToday] = await sql`
    SELECT COALESCE(SUM(count), 0) as count FROM daily_activity
    WHERE date = CURRENT_DATE AND action_type = 'message'
  `;
  const [campaignLeads] = await sql`
    SELECT COUNT(*) as count FROM leads WHERE tags LIKE ${'%campaign-%'}
  `;
  const [sentMessages] = await sql`
    SELECT COUNT(*) as count FROM outreach_queue WHERE status = 'sent'
  `;
  const [unread] = await sql`
    SELECT COUNT(*) as count FROM conversations WHERE unread_count > 0
  `;

  res.json({
    leads: Number(leads.count),
    conversations: Number(conversations.count),
    messages: Number(messages.count),
    posts: Number(posts.count),
    sentToday: Number(sentToday.count),
    campaignLeads: Number(campaignLeads.count),
    sentMessages: Number(sentMessages.count),
    unreadConversations: Number(unread.count),
    accounts: getAccounts(),
  });
});

// --- Leads ---
apiRouter.get("/leads", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const tag = req.query.tag as string;
  const search = req.query.search as string;
  const account = req.query.account as string;

  let rows;
  if (search) {
    rows = await sql`
      SELECT * FROM leads
      WHERE (name ILIKE ${"%" + search + "%"} OR headline ILIKE ${"%" + search + "%"} OR company ILIKE ${"%" + search + "%"})
      ${account ? sql`AND account_id = ${resolveAccountId(account)}` : sql``}
      ORDER BY imported_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (tag) {
    rows = await sql`
      SELECT * FROM leads WHERE tags LIKE ${"%" + tag + "%"}
      ${account ? sql`AND account_id = ${resolveAccountId(account)}` : sql``}
      ORDER BY imported_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT * FROM leads
      ${account ? sql`WHERE account_id = ${resolveAccountId(account)}` : sql``}
      ORDER BY imported_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
  }

  const [total] = await sql`SELECT COUNT(*) as count FROM leads`;
  res.json({ items: rows, total: Number(total.count) });
});

apiRouter.post("/leads/:id/tag", async (req, res) => {
  const { tag } = req.body;
  const lead = await sql`SELECT tags FROM leads WHERE id = ${req.params.id}`;
  if (lead.length === 0) return res.status(404).json({ error: "Lead not found" });

  const currentTags = lead[0].tags ? lead[0].tags.split(",") : [];
  if (!currentTags.includes(tag)) currentTags.push(tag);

  await sql`UPDATE leads SET tags = ${currentTags.join(",")} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// --- Conversations ---
apiRouter.get("/conversations", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const account = req.query.account as string;
  const unreadOnly = req.query.unread === "true";

  const rows = await sql`
    SELECT c.*, l.name as lead_name, l.headline as lead_headline,
      (SELECT m.text FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_text,
      (SELECT m.is_sender FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_is_sender,
      (SELECT m.sender_id FROM messages m WHERE m.chat_id = c.chat_id AND m.is_sender = false ORDER BY m.timestamp DESC LIMIT 1) as last_sender_id
    FROM conversations c
    LEFT JOIN leads l ON c.lead_id = l.id
    WHERE 1=1
    ${account ? sql`AND c.account_id = ${resolveAccountId(account)}` : sql``}
    ${unreadOnly ? sql`AND c.unread_count > 0` : sql``}
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `;

  res.json({ items: rows });
});

apiRouter.get("/conversations/:chatId/messages", async (req, res) => {
  const rows = await sql`
    SELECT * FROM messages WHERE chat_id = ${req.params.chatId}
    ORDER BY timestamp ASC
  `;
  res.json({ items: rows });
});

apiRouter.post("/conversations/:chatId/reply", async (req, res) => {
  const { text, account } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  try {
    const unipile = new UnipileService(account);
    await unipile.sendMessage(req.params.chatId, text);

    await sql`
      INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
      VALUES (0, ${"web-" + req.params.chatId + "-" + Date.now()}, ${req.params.chatId}, ${unipile.accountId}, ${text}, true, 'WEB_REPLY', NOW(), true)
      ON CONFLICT (message_id) DO NOTHING
    `;

    broadcast("message", { chatId: req.params.chatId, isSender: true, text: text.slice(0, 100) });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/conversations/:chatId/ai-reply", async (req, res) => {
  const { account } = req.body;
  try {
    const unipile = new UnipileService(account);
    const claude = new ClaudeService();

    const msgs = await sql`SELECT * FROM messages WHERE chat_id = ${req.params.chatId} ORDER BY timestamp ASC`;
    const conv = await sql`SELECT * FROM conversations WHERE chat_id = ${req.params.chatId}`;
    const leadName = conv[0]?.attendee_name || "Lead";

    const messages = msgs.map((m: any) => ({
      id: m.message_id, chat_id: m.chat_id, sender_id: m.sender_id,
      text: m.text, timestamp: m.timestamp, is_sender: m.is_sender,
    }));

    const draft = await claude.generateReply(messages as any, { name: leadName });
    res.json({ draft });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Posts ---
apiRouter.get("/posts", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const isCompany = req.query.company === "true";

  const rows = await sql`
    SELECT * FROM posts
    WHERE is_company_post = ${isCompany}
    ORDER BY posted_at DESC NULLS LAST
    LIMIT ${limit}
  `;
  res.json({ items: rows });
});

// --- Campaign ---
apiRouter.get("/campaign/status", async (req, res) => {
  const accounts = getAccounts();
  const results = [];

  for (const acc of accounts) {
    const [leadCount] = await sql`
      SELECT COUNT(*) as count FROM leads
      WHERE account_id = ${acc.id} AND tags LIKE ${"%" + CAMPAIGN_NAME + "%"}
    `;
    const [campaign] = await sql`
      SELECT id FROM outreach_campaigns WHERE account_id = ${acc.id} AND name = ${CAMPAIGN_NAME}
    `;

    let sent = 0, failed = 0, pending = 0;
    if (campaign) {
      const [counts] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status = 'pending') as pending
        FROM outreach_queue WHERE campaign_id = ${campaign.id}
      `;
      sent = Number(counts.sent); failed = Number(counts.failed); pending = Number(counts.pending);
    }

    results.push({ account: acc, leads: Number(leadCount.count), sent, failed, pending });
  }

  res.json({ campaign: CAMPAIGN_NAME, plan: DAILY_SEARCH_QUERIES, accounts: results });
});

apiRouter.post("/campaign/run", async (req, res) => {
  const { account, day, maxLeads, maxMessages, dryRun } = req.body;
  try {
    const result = await runCampaignDay({
      accountAlias: account,
      dayNumber: day || 1,
      maxNewLeads: maxLeads || 25,
      maxMessages: maxMessages || 20,
      dryRun: dryRun ?? true,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Search ---
apiRouter.post("/search", async (req, res) => {
  const { account, keywords, location, title, limit, save, tag } = req.body;
  try {
    const results = await searchLeads({
      accountAlias: account,
      keywords,
      location: location ? [location] : undefined,
      title,
      limit: limit || 25,
      save: save ?? false,
      tag: tag || "search",
    });
    res.json({ items: results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Sync ---
apiRouter.post("/sync", async (req, res) => {
  const { type, account } = req.body;
  try {
    let result: any = {};
    switch (type) {
      case "leads":
        result.count = await syncLeads(account);
        break;
      case "conversations":
        result = await syncConversations({ accountAlias: account, syncMessages: true });
        break;
      case "posts":
        result.count = await syncPosts({ accountAlias: account });
        break;
      case "company-posts":
        result.count = await syncCompanyPosts({
          accountAlias: account,
          companyId: appConfig.linkedinCompanyIds.split(",")[0],
        });
        break;
    }
    broadcast("sync", { type, ...result });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Messages (all) ---
apiRouter.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const type = req.query.type as string;
  const sentParam = req.query.sent as string;

  const rows = await sql`
    SELECT m.*,
      COALESCE(
        NULLIF(c.attendee_name,''),
        l.name,
        (SELECT l2.name FROM leads l2 WHERE l2.linkedin_id = c.attendee_provider_id AND c.attendee_provider_id != '' LIMIT 1),
        NULLIF(c.subject,''),
        'Chat'
      ) as contact_name,
      CASE
        WHEN m.is_sender AND c.account_id = 'hYhcYj2_R2Kp7AQCtvQYZg' THEN 'Ihor'
        WHEN m.is_sender AND c.account_id = 'H4VkNF35Qn2cxLJjqnxTzw' THEN 'Vladimir'
        ELSE NULL
      END as sender_name
    FROM messages m
    LEFT JOIN conversations c ON m.chat_id = c.chat_id
    LEFT JOIN leads l ON c.lead_id = l.id
    WHERE 1=1
    ${type ? sql`AND m.message_type = ${type}` : sql``}
    ${sentParam === "true" ? sql`AND m.is_sender = true` : sentParam === "false" ? sql`AND m.is_sender = false` : sql``}
    ORDER BY m.timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const [total] = await sql`SELECT COUNT(*) as count FROM messages`;
  res.json({ items: rows, total: Number(total.count) });
});

// --- Outreach Queue ---
apiRouter.get("/outreach", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string;

  const rows = await sql`
    SELECT oq.*, l.name as lead_name, l.headline as lead_headline, l.linkedin_id,
           oc.name as campaign_name
    FROM outreach_queue oq
    LEFT JOIN leads l ON oq.lead_id = l.id
    LEFT JOIN outreach_campaigns oc ON oq.campaign_id = oc.id
    WHERE 1=1
    ${status ? sql`AND oq.status = ${status}` : sql``}
    ORDER BY oq.scheduled_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const [total] = await sql`SELECT COUNT(*) as count FROM outreach_queue`;
  res.json({ items: rows, total: Number(total.count) });
});

// --- Campaigns CRUD ---
apiRouter.get("/campaigns", async (_req, res) => {
  const rows = await sql`
    SELECT oc.*,
      (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id AND status = 'sent') as sent_count,
      (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id AND status = 'failed') as failed_count,
      (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id AND status = 'pending') as pending_count,
      (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id) as total_count
    FROM outreach_campaigns oc
    ORDER BY oc.created_at DESC
  `;
  res.json({ items: rows });
});

apiRouter.post("/campaigns", async (req, res) => {
  const { name, template, targetTags, account } = req.body;
  const accountId = resolveAccountId(account);
  const [campaign] = await sql`
    INSERT INTO outreach_campaigns (account_id, name, template, target_tags, status)
    VALUES (${accountId}, ${name}, ${template || ''}, ${targetTags || ''}, 'active')
    RETURNING *
  `;
  res.json(campaign);
});

apiRouter.patch("/campaigns/:id", async (req, res) => {
  const { status } = req.body;
  await sql`UPDATE outreach_campaigns SET status = ${status} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// --- Daily Activity ---
apiRouter.get("/activity", async (_req, res) => {
  const rows = await sql`
    SELECT da.*,
      CASE WHEN da.account_id = '' THEN 'unknown' ELSE da.account_id END as acc
    FROM daily_activity da
    ORDER BY da.date DESC, da.action_type
    LIMIT 100
  `;
  res.json({ items: rows });
});

// --- Drafts ---
apiRouter.get("/drafts", async (_req, res) => {
  const rows = await sql`
    SELECT d.*, c.attendee_name, c.chat_id
    FROM drafts d
    LEFT JOIN conversations c ON d.conversation_id = c.id
    ORDER BY d.created_at DESC
    LIMIT 100
  `;
  res.json({ items: rows });
});

// --- Config ---
apiRouter.get("/config", async (_req, res) => {
  res.json({
    accounts: getAccounts(),
    defaultAccount: appConfig.unipileDefaultAccount,
    model: appConfig.bedrockModel,
    limits: {
      messagesPerDay: appConfig.maxMessagesPerDay,
      invitationsPerDay: appConfig.maxInvitationsPerDay,
      delay: `${appConfig.minDelaySeconds}-${appConfig.maxDelaySeconds}s`,
      businessHours: `${appConfig.businessHoursStart}:00-${appConfig.businessHoursEnd}:00`,
    },
    persona: {
      name: appConfig.senderName,
      company: appConfig.senderCompany,
      objective: appConfig.campaignObjective,
    },
  });
});
