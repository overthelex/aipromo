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
  const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 1000));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  const tag = req.query.tag as string;
  const search = req.query.search as string;
  const account = req.query.account as string;
  const accountId = account ? resolveAccountId(account) : null;

  const where = search
    ? sql`WHERE (name ILIKE ${"%" + search + "%"} OR headline ILIKE ${"%" + search + "%"} OR company ILIKE ${"%" + search + "%"}) ${accountId ? sql`AND account_id = ${accountId}` : sql``}`
    : tag
    ? sql`WHERE tags LIKE ${"%" + tag + "%"} ${accountId ? sql`AND account_id = ${accountId}` : sql``}`
    : accountId
    ? sql`WHERE account_id = ${accountId}`
    : sql``;

  const rows = await sql`SELECT * FROM leads ${where} ORDER BY imported_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const [total] = await sql`SELECT COUNT(*) as count FROM leads ${where}`;
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

apiRouter.delete("/leads/:id", async (req, res) => {
  await sql`DELETE FROM outreach_queue WHERE lead_id = ${req.params.id}`;
  await sql`DELETE FROM follow_ups WHERE lead_id = ${req.params.id}`;
  await sql`DELETE FROM lead_notes WHERE lead_id = ${req.params.id}`;
  await sql`DELETE FROM deals WHERE lead_id = ${req.params.id}`;
  await sql`DELETE FROM leads WHERE id = ${req.params.id}`;
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

    // Rate limit check
    const { checkAndIncrementDaily } = await import("../utils/rate-limiter.js");
    const canSend = await checkAndIncrementDaily(unipile.accountId, "message", appConfig.maxMessagesPerDay);
    if (!canSend) return res.status(429).json({ error: `Daily limit reached (${appConfig.maxMessagesPerDay})` });

    await unipile.sendMessage(req.params.chatId, text);

    await sql`
      INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
      VALUES (NULL, ${"web-" + req.params.chatId + "-" + Date.now()}, ${req.params.chatId}, ${unipile.accountId}, ${text}, true, 'WEB_REPLY', NOW(), true)
      ON CONFLICT (message_id) DO NOTHING
    `;

    // Mark conversation as read after reply
    await sql`UPDATE conversations SET unread_count = 0, status = 'read' WHERE chat_id = ${req.params.chatId}`;

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

  // Return immediately, run in background with WS progress
  res.json({ status: "running" });

  const log = (msg: string) => broadcast("campaign_log", { msg });

  try {
    log(`Starting campaign day ${day || 1} for ${account}...`);

    const result = await runCampaignDay({
      accountAlias: account,
      dayNumber: day || 1,
      maxNewLeads: maxLeads || 25,
      maxMessages: maxMessages || 20,
      dryRun: dryRun ?? true,
    });

    log(`Done! Searched: ${result.searched}, Sent: ${result.messaged}, Scheduled: ${result.scheduled}, Replied: ${result.replied}, Follow-ups: ${result.followUps}`);
    broadcast("campaign_done", result);
  } catch (err: any) {
    log(`Error: ${err.message}`);
    broadcast("campaign_done", { error: err.message });
  }
});

// --- Process scheduled outreach (for cron) ---
apiRouter.post("/campaign/send-scheduled", async (req, res) => {
  const { account } = req.body;
  res.json({ status: "processing" });

  const log = (msg: string) => broadcast("campaign_log", { msg });
  try {
    const { processScheduledOutreach } = await import("../campaigns/engine.js");
    const { UnipileService } = await import("../services/unipile.service.js");
    const unipile = new UnipileService(account);
    const sent = await processScheduledOutreach(unipile, unipile.accountId);
    log(`Scheduled outreach: ${sent} sent`);
    broadcast("campaign_done", { scheduled_sent: sent });
  } catch (err: any) {
    log(`Scheduled outreach error: ${err.message}`);
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

  const accountMap = Object.fromEntries(getAccounts().map(a => [a.id, a.name.split(" ")[0]]));

  const rows = await sql`
    SELECT m.*,
      COALESCE(
        NULLIF(c.attendee_name,''),
        l.name,
        (SELECT l2.name FROM leads l2 WHERE l2.linkedin_id = c.attendee_provider_id AND c.attendee_provider_id != '' LIMIT 1),
        NULLIF(c.subject,''),
        'Chat'
      ) as contact_name,
      c.account_id as conv_account_id
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
  const items = rows.map((r: any) => ({
    ...r,
    sender_name: r.is_sender ? (accountMap[r.conv_account_id] || null) : null,
  }));
  res.json({ items, total: Number(total.count) });
});

// --- Mark conversation as read ---
apiRouter.post("/conversations/:chatId/read", async (req, res) => {
  await sql`UPDATE conversations SET unread_count = 0, status = 'read' WHERE chat_id = ${req.params.chatId}`;
  broadcast("read", { chatId: req.params.chatId });
  res.json({ ok: true });
});

// --- Message search ---
apiRouter.get("/search/messages", async (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) return res.json({ items: [] });
  const rows = await sql`
    SELECT m.*, c.attendee_name, c.subject as conv_subject
    FROM messages m
    LEFT JOIN conversations c ON m.chat_id = c.chat_id
    WHERE m.text ILIKE ${"%" + q + "%"}
    ORDER BY m.timestamp DESC
    LIMIT 50
  `;
  res.json({ items: rows });
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

// Update outreach item status
apiRouter.patch("/outreach/:id", async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'sent', 'failed'];
  if (!valid.includes(status)) return res.status(400).json({ error: `Invalid status. Valid: ${valid.join(', ')}` });
  await sql`UPDATE outreach_queue SET status = ${status}, sent_at = ${status === 'sent' ? sql`NOW()` : sql`NULL`} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// Delete outreach item
apiRouter.delete("/outreach/:id", async (req, res) => {
  await sql`DELETE FROM outreach_queue WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// Retry outreach item (reset to pending)
apiRouter.post("/outreach/:id/retry", async (req, res) => {
  await sql`UPDATE outreach_queue SET status = 'pending', sent_at = NULL WHERE id = ${req.params.id}`;
  // Also reset lead status back to prospect so it's eligible
  const [oq] = await sql`SELECT lead_id FROM outreach_queue WHERE id = ${req.params.id}`;
  if (oq) await sql`UPDATE leads SET status = 'prospect' WHERE id = ${oq.lead_id} AND status IN ('contacted', 'rejected')`;
  res.json({ ok: true });
});

// --- Outreach Timeline (past + future) ---
apiRouter.get("/outreach/timeline", async (req, res) => {
  const campaignId = req.query.campaign as string;
  const account = req.query.account as string;

  // Past: all outreach_queue entries
  const past = await sql`
    SELECT oq.id, oq.status, oq.message_text, oq.scheduled_at, oq.sent_at,
           l.name as lead_name, l.headline as lead_headline, l.location as lead_location,
           l.linkedin_id, l.tags as lead_tags,
           oc.name as campaign_name, oc.account_id
    FROM outreach_queue oq
    LEFT JOIN leads l ON oq.lead_id = l.id
    LEFT JOIN outreach_campaigns oc ON oq.campaign_id = oc.id
    WHERE 1=1
    ${campaignId ? sql`AND oq.campaign_id = ${parseInt(campaignId)}` : sql``}
    ${account ? sql`AND oc.account_id = ${resolveAccountId(account)}` : sql``}
    ORDER BY COALESCE(oq.sent_at, oq.scheduled_at) DESC
  `;

  // Future: campaign-tagged leads NOT yet in outreach_queue and NOT in conversations
  const accountId = account ? resolveAccountId(account) : null;
  const future = accountId ? await sql`
    SELECT l.id as lead_id, l.name as lead_name, l.headline as lead_headline,
           l.location as lead_location, l.linkedin_id, l.tags as lead_tags
    FROM leads l
    WHERE l.account_id = ${accountId}
      AND l.tags LIKE '%campaign-%'
      AND l.id NOT IN (SELECT oq.lead_id FROM outreach_queue oq WHERE oq.lead_id IS NOT NULL AND oq.status = 'sent')
      AND l.linkedin_id NOT IN (
        SELECT c.attendee_provider_id FROM conversations c
        WHERE c.account_id = ${accountId} AND c.attendee_provider_id != ''
      )
    ORDER BY l.imported_at DESC
  ` : [];

  // Stats
  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending
    FROM outreach_queue
    ${campaignId ? sql`WHERE campaign_id = ${parseInt(campaignId)}` : sql``}
  `;

  res.json({
    past: past,
    future: future,
    stats: { sent: Number(stats.sent), failed: Number(stats.failed), pending: Number(stats.pending), upcoming: (future as any[]).length },
  });
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

apiRouter.get("/campaigns/:id", async (req, res) => {
  const [campaign] = await sql`SELECT * FROM outreach_campaigns WHERE id = ${req.params.id}`;
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const queue = await sql`
    SELECT oq.*, l.name as lead_name, l.headline as lead_headline
    FROM outreach_queue oq
    LEFT JOIN leads l ON oq.lead_id = l.id
    WHERE oq.campaign_id = ${req.params.id}
    ORDER BY COALESCE(oq.sent_at, oq.scheduled_at) DESC
    LIMIT 100
  `;
  const [counts] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending
    FROM outreach_queue WHERE campaign_id = ${req.params.id}
  `;
  res.json({ campaign, queue, counts });
});

apiRouter.delete("/campaigns/:id", async (req, res) => {
  await sql`DELETE FROM outreach_queue WHERE campaign_id = ${req.params.id}`;
  await sql`DELETE FROM outreach_campaigns WHERE id = ${req.params.id}`;
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

// --- Lead Status ---
apiRouter.patch("/leads/:id/status", async (req, res) => {
  const { status } = req.body;
  const valid = ['prospect','contacted','responded','interested','demo','customer','rejected'];
  if (!valid.includes(status)) return res.status(400).json({ error: `Invalid status. Valid: ${valid.join(', ')}` });
  await sql`UPDATE leads SET status = ${status} WHERE id = ${req.params.id}`;
  // If rejected/customer → cancel pending follow-ups
  if (status === 'rejected' || status === 'customer') {
    await sql`UPDATE follow_ups SET status = 'cancelled' WHERE lead_id = ${parseInt(req.params.id)} AND status = 'pending'`;
  }
  broadcast("lead_status", { leadId: req.params.id, status });
  res.json({ ok: true });
});

// --- Lead Pipeline ---
apiRouter.get("/pipeline", async (_req, res) => {
  const rows = await sql`
    SELECT status, COUNT(*) as count FROM leads
    WHERE status != 'prospect' OR tags LIKE '%campaign-%'
    GROUP BY status ORDER BY
      CASE status
        WHEN 'prospect' THEN 1 WHEN 'contacted' THEN 2 WHEN 'responded' THEN 3
        WHEN 'interested' THEN 4 WHEN 'demo' THEN 5 WHEN 'customer' THEN 6 WHEN 'rejected' THEN 7
      END
  `;
  res.json({ stages: rows });
});

// --- Lead Detail & Timeline ---
apiRouter.get("/leads/:id", async (req, res) => {
  const [lead] = await sql`SELECT * FROM leads WHERE id = ${req.params.id}`;
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const messages = await sql`
    SELECT m.text, m.is_sender, m.message_type, m.timestamp, 'message' as event_type
    FROM messages m
    JOIN conversations c ON m.chat_id = c.chat_id
    WHERE c.attendee_provider_id = ${lead.linkedin_id} AND c.account_id = ${lead.account_id}
    ORDER BY m.timestamp DESC LIMIT 50
  `;
  const outreach = await sql`
    SELECT message_text as text, status, sent_at as timestamp, message_angle, 'outreach' as event_type
    FROM outreach_queue WHERE lead_id = ${req.params.id}
    ORDER BY scheduled_at DESC
  `;
  const notes = await sql`SELECT * FROM lead_notes WHERE lead_id = ${req.params.id} ORDER BY created_at DESC`;
  const followUps = await sql`SELECT * FROM follow_ups WHERE lead_id = ${req.params.id} ORDER BY scheduled_for`;
  const deals = await sql`SELECT * FROM deals WHERE lead_id = ${req.params.id} ORDER BY created_at DESC`;

  res.json({ lead, messages, outreach, notes, followUps, deals });
});

// --- Lead Notes ---
apiRouter.post("/leads/:id/notes", async (req, res) => {
  const { note, author } = req.body;
  if (!note) return res.status(400).json({ error: "note required" });
  const [created] = await sql`
    INSERT INTO lead_notes (lead_id, author, note) VALUES (${req.params.id}, ${author || ''}, ${note}) RETURNING *
  `;
  res.json(created);
});

// --- Follow-ups ---
apiRouter.get("/follow-ups", async (req, res) => {
  const status = req.query.status as string || 'pending';
  const rows = await sql`
    SELECT f.*, l.name as lead_name, l.headline as lead_headline
    FROM follow_ups f LEFT JOIN leads l ON f.lead_id = l.id
    WHERE f.status = ${status}
    ORDER BY f.scheduled_for ASC LIMIT 200
  `;
  res.json({ items: rows });
});

apiRouter.patch("/follow-ups/:id", async (req, res) => {
  const { status } = req.body;
  await sql`UPDATE follow_ups SET status = ${status} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// --- Deals ---
apiRouter.get("/deals", async (_req, res) => {
  const rows = await sql`
    SELECT d.*, l.name as lead_name, l.headline as lead_headline
    FROM deals d LEFT JOIN leads l ON d.lead_id = l.id
    ORDER BY d.created_at DESC
  `;
  const [totals] = await sql`
    SELECT
      COUNT(*) as total,
      SUM(value) FILTER (WHERE stage != 'closed_lost') as pipeline_value,
      SUM(value) FILTER (WHERE stage = 'closed_won') as won_value,
      COUNT(*) FILTER (WHERE stage = 'closed_won') as won_count
    FROM deals
  `;
  res.json({ items: rows, totals });
});

apiRouter.post("/deals", async (req, res) => {
  const { lead_id, account_id, title, value, currency, stage } = req.body;
  const [deal] = await sql`
    INSERT INTO deals (lead_id, account_id, title, value, currency, stage)
    VALUES (${lead_id}, ${account_id || ''}, ${title || ''}, ${value || 0}, ${currency || 'UAH'}, ${stage || 'qualification'})
    RETURNING *
  `;
  res.json(deal);
});

apiRouter.patch("/deals/:id", async (req, res) => {
  const { stage, value, closed_at } = req.body;
  if (stage) await sql`UPDATE deals SET stage = ${stage} ${closed_at ? sql`, closed_at = ${closed_at}` : sql``} WHERE id = ${req.params.id}`;
  if (value !== undefined) await sql`UPDATE deals SET value = ${value} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// --- Analytics ---
apiRouter.get("/analytics", async (_req, res) => {
  // Funnel
  const [funnel] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status != 'prospect') as total_in_pipeline,
      COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
      COUNT(*) FILTER (WHERE status = 'responded') as responded,
      COUNT(*) FILTER (WHERE status = 'interested') as interested,
      COUNT(*) FILTER (WHERE status = 'demo') as demo,
      COUNT(*) FILTER (WHERE status = 'customer') as customer,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected
    FROM leads WHERE tags LIKE '%campaign-%'
  `;

  // Reply rate
  const [outreachStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
      COUNT(*) FILTER (WHERE status = 'failed') as total_failed
    FROM outreach_queue
  `;
  const [replied] = await sql`
    SELECT COUNT(DISTINCT oq.lead_id) as count
    FROM outreach_queue oq
    JOIN leads l ON oq.lead_id = l.id
    WHERE oq.status = 'sent' AND l.status IN ('responded','interested','demo','customer')
  `;
  const replyRate = Number(outreachStats.total_sent) > 0
    ? (Number(replied.count) / Number(outreachStats.total_sent) * 100).toFixed(1)
    : 0;

  // By angle
  const angleStats = await sql`
    SELECT oq.message_angle as angle,
      COUNT(*) as sent,
      COUNT(*) FILTER (WHERE l.status IN ('responded','interested','demo','customer')) as replied
    FROM outreach_queue oq
    JOIN leads l ON oq.lead_id = l.id
    WHERE oq.status = 'sent' AND oq.message_angle != ''
    GROUP BY oq.message_angle
  `;

  // Follow-ups
  const [fuStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
    FROM follow_ups
  `;

  res.json({
    funnel,
    outreach: { sent: Number(outreachStats.total_sent), failed: Number(outreachStats.total_failed), replyRate: Number(replyRate) },
    replied: Number(replied.count),
    angleStats,
    followUps: fuStats,
  });
});

// --- Conversations management ---
apiRouter.delete("/conversations/:chatId", async (req, res) => {
  await sql`DELETE FROM messages WHERE chat_id = ${req.params.chatId}`;
  await sql`DELETE FROM conversations WHERE chat_id = ${req.params.chatId}`;
  res.json({ ok: true });
});

apiRouter.patch("/conversations/:chatId/archive", async (req, res) => {
  await sql`UPDATE conversations SET status = 'archived', unread_count = 0 WHERE chat_id = ${req.params.chatId}`;
  res.json({ ok: true });
});

// --- Messages management ---
apiRouter.delete("/messages/:id", async (req, res) => {
  await sql`DELETE FROM messages WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// --- Deals detail ---
apiRouter.get("/deals/:id", async (req, res) => {
  const [deal] = await sql`
    SELECT d.*, l.name as lead_name, l.headline as lead_headline, l.company, l.location
    FROM deals d LEFT JOIN leads l ON d.lead_id = l.id
    WHERE d.id = ${req.params.id}
  `;
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  const notes = await sql`SELECT * FROM lead_notes WHERE lead_id = ${deal.lead_id} ORDER BY created_at DESC LIMIT 10`;
  res.json({ deal, notes });
});

apiRouter.delete("/deals/:id", async (req, res) => {
  await sql`DELETE FROM deals WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// --- Follow-ups management ---
apiRouter.delete("/follow-ups/:id", async (req, res) => {
  await sql`DELETE FROM follow_ups WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

apiRouter.post("/follow-ups/:id/reschedule", async (req, res) => {
  const { days } = req.body;
  await sql`UPDATE follow_ups SET scheduled_for = scheduled_for + ${(days || 1) + ' days'}::interval WHERE id = ${req.params.id} AND status = 'pending'`;
  res.json({ ok: true });
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
