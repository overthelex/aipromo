import { sql } from "../storage/store.js";
import { getAccounts, resolveAccountId, resolveAccountName } from "../config.js";
import { runCampaignDay } from "../campaigns/engine.js";
import { CAMPAIGN_NAME, DAILY_SEARCH_QUERIES, PRODUCT_CONTEXT } from "../campaigns/registry-access-2w.js";
import { logger } from "../utils/logger.js";

// ─── System prompt for the AI chat assistant ───────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `You are the AI assistant for selected.ai — a LinkedIn lead automation platform.
You help users create, configure, and run LinkedIn outreach campaigns through conversation.

## Platform capabilities
- **Lead discovery**: Search LinkedIn for leads by keywords, job title, location
- **Campaign management**: Create campaigns with message templates, target tags, and account assignment
- **Automated outreach**: Run campaign days that search for leads, generate personalized AI messages, and send them via LinkedIn
- **Follow-up sequences**: Automated 3-step follow-ups (day+3, day+5, day+7) with angle rotation
- **Pipeline tracking**: Track leads through stages: prospect → contacted → responded → interested → demo → customer
- **Analytics**: Reply rates, funnel metrics, message angle performance (7 angles: pain_time, pain_cost, social_proof, free_bonus, tech_innovation, competitor_gap, question_hook)

## Accounts
${getAccounts().map(a => `- **${a.alias}** (${a.name})`).join("\n")}

## Current campaign
Active campaign: "${CAMPAIGN_NAME}" — 14-day rotating campaign.
${PRODUCT_CONTEXT.slice(0, 500)}

## Guidelines
- Always confirm before running campaigns with dry_run=false (real sends)
- Default to dry_run=true when running campaigns unless the user explicitly says to execute for real
- Present tool results clearly — not raw JSON
- If you can answer from context, answer directly without tools
- Be concise and action-oriented
- Match the user's language (Ukrainian or English)
- When showing numbers, use clear formatting`;

// ─── Tool definitions (Anthropic tool_use format) ──────────────────────────────

export const CHAT_TOOLS = [
  {
    name: "list_campaigns",
    description: "List all outreach campaigns with stats (sent, failed, pending counts)",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "create_campaign",
    description: "Create a new LinkedIn outreach campaign",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Campaign name" },
        account: { type: "string", description: "Account alias (e.g. 'ihor' or 'vladimir')" },
        template: { type: "string", description: "Message template with personalization placeholders" },
        target_tags: { type: "string", description: "Comma-separated tags to target leads" },
      },
      required: ["name", "account"],
    },
  },
  {
    name: "run_campaign_day",
    description: "Run a campaign day: search for leads, generate personalized messages, and send them. Use dry_run=true to preview without sending.",
    input_schema: {
      type: "object" as const,
      properties: {
        account: { type: "string", description: "Account alias" },
        day: { type: "number", description: "Day number (1-14), defaults to 1" },
        max_leads: { type: "number", description: "Max new leads to find (default 25)" },
        max_messages: { type: "number", description: "Max messages to send (default 20)" },
        dry_run: { type: "boolean", description: "If true, simulate without sending. Defaults to true." },
      },
      required: ["account"],
    },
  },
  {
    name: "get_campaign_status",
    description: "Get current campaign status: leads found, messages sent/failed/pending per account",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "search_leads",
    description: "Search for leads in the database by name, headline, company, or tag",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Search query (matches name, headline, company)" },
        tag: { type: "string", description: "Filter by tag" },
        account: { type: "string", description: "Filter by account alias" },
        status: { type: "string", description: "Filter by status (prospect, contacted, responded, interested, demo, customer, rejected)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_analytics",
    description: "Get campaign analytics: funnel stats, reply rates, performance by message angle",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_pipeline",
    description: "Get lead pipeline breakdown by status (prospect, contacted, responded, interested, demo, customer, rejected)",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "update_campaign",
    description: "Update a campaign's status (active, paused, completed)",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "number", description: "Campaign ID" },
        status: { type: "string", enum: ["active", "paused", "completed"], description: "New status" },
      },
      required: ["campaign_id", "status"],
    },
  },
  {
    name: "get_daily_plan",
    description: "Get the 14-day campaign plan showing daily search queries, keywords, titles, and message angle rotation",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  logger.info({ tool: name, input }, "Chat tool execution");

  switch (name) {
    case "list_campaigns": {
      const rows = await sql`
        SELECT oc.*,
          (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id AND status = 'sent') as sent_count,
          (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id AND status = 'failed') as failed_count,
          (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id AND status = 'pending') as pending_count,
          (SELECT COUNT(*) FROM outreach_queue WHERE campaign_id = oc.id) as total_count
        FROM outreach_campaigns oc
        ORDER BY oc.created_at DESC
      `;
      return {
        campaigns: rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          account: resolveAccountName(r.account_id),
          status: r.status,
          sent: Number(r.sent_count),
          failed: Number(r.failed_count),
          pending: Number(r.pending_count),
          total: Number(r.total_count),
          created: r.created_at,
        })),
      };
    }

    case "create_campaign": {
      const accountId = resolveAccountId(input.account as string);
      const [campaign] = await sql`
        INSERT INTO outreach_campaigns (account_id, name, template, target_tags, status)
        VALUES (${accountId}, ${input.name as string}, ${(input.template as string) || ""}, ${(input.target_tags as string) || ""}, 'active')
        RETURNING *
      `;
      return {
        id: campaign.id,
        name: campaign.name,
        account: resolveAccountName(accountId),
        status: campaign.status,
        created: campaign.created_at,
      };
    }

    case "run_campaign_day": {
      const result = await runCampaignDay({
        accountAlias: input.account as string,
        dayNumber: (input.day as number) || 1,
        maxNewLeads: (input.max_leads as number) || 25,
        maxMessages: (input.max_messages as number) || 20,
        dryRun: input.dry_run !== false,
      });
      return result;
    }

    case "get_campaign_status": {
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
          sent = Number(counts.sent);
          failed = Number(counts.failed);
          pending = Number(counts.pending);
        }
        results.push({
          account: acc.alias,
          name: acc.name,
          leads: Number(leadCount.count),
          sent,
          failed,
          pending,
        });
      }
      return { campaign: CAMPAIGN_NAME, accounts: results };
    }

    case "search_leads": {
      const limit = Math.min((input.limit as number) || 20, 50);
      const search = input.search as string;
      const tag = input.tag as string;
      const account = input.account as string;
      const status = input.status as string;
      const accountId = account ? resolveAccountId(account) : null;

      const where = search
        ? sql`WHERE (name ILIKE ${"%" + search + "%"} OR headline ILIKE ${"%" + search + "%"} OR company ILIKE ${"%" + search + "%"}) ${accountId ? sql`AND account_id = ${accountId}` : sql``} ${status ? sql`AND status = ${status}` : sql``}`
        : tag
        ? sql`WHERE tags LIKE ${"%" + tag + "%"} ${accountId ? sql`AND account_id = ${accountId}` : sql``} ${status ? sql`AND status = ${status}` : sql``}`
        : accountId
        ? sql`WHERE account_id = ${accountId} ${status ? sql`AND status = ${status}` : sql``}`
        : status
        ? sql`WHERE status = ${status}`
        : sql``;

      const rows = await sql`SELECT id, name, headline, company, title, location, status, tags FROM leads ${where} ORDER BY imported_at DESC LIMIT ${limit}`;
      const [total] = await sql`SELECT COUNT(*) as count FROM leads ${where}`;
      return { leads: rows, total: Number(total.count), showing: rows.length };
    }

    case "get_analytics": {
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
      const totalSent = Number(outreachStats.total_sent);
      const replyRate = totalSent > 0 ? (Number(replied.count) / totalSent * 100).toFixed(1) : "0";

      const angleStats = await sql`
        SELECT oq.message_angle as angle,
          COUNT(*) as sent,
          COUNT(*) FILTER (WHERE l.status IN ('responded','interested','demo','customer')) as replied
        FROM outreach_queue oq
        JOIN leads l ON oq.lead_id = l.id
        WHERE oq.status = 'sent' AND oq.message_angle != ''
        GROUP BY oq.message_angle
      `;

      const [fuStats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
        FROM follow_ups
      `;

      return {
        funnel: {
          total_in_pipeline: Number(funnel.total_in_pipeline),
          contacted: Number(funnel.contacted),
          responded: Number(funnel.responded),
          interested: Number(funnel.interested),
          demo: Number(funnel.demo),
          customer: Number(funnel.customer),
          rejected: Number(funnel.rejected),
        },
        outreach: {
          sent: totalSent,
          failed: Number(outreachStats.total_failed),
          reply_rate: `${replyRate}%`,
          replied: Number(replied.count),
        },
        angle_performance: angleStats.map((a: any) => ({
          angle: a.angle,
          sent: Number(a.sent),
          replied: Number(a.replied),
          rate: Number(a.sent) > 0 ? `${(Number(a.replied) / Number(a.sent) * 100).toFixed(1)}%` : "0%",
        })),
        follow_ups: {
          pending: Number(fuStats.pending),
          sent: Number(fuStats.sent),
          cancelled: Number(fuStats.cancelled),
        },
      };
    }

    case "get_pipeline": {
      const rows = await sql`
        SELECT status, COUNT(*) as count FROM leads
        WHERE status != 'prospect' OR tags LIKE '%campaign-%'
        GROUP BY status ORDER BY
          CASE status
            WHEN 'prospect' THEN 1 WHEN 'contacted' THEN 2 WHEN 'responded' THEN 3
            WHEN 'interested' THEN 4 WHEN 'demo' THEN 5 WHEN 'customer' THEN 6 WHEN 'rejected' THEN 7
          END
      `;
      return {
        stages: rows.map((r: any) => ({ status: r.status, count: Number(r.count) })),
      };
    }

    case "update_campaign": {
      await sql`UPDATE outreach_campaigns SET status = ${input.status as string} WHERE id = ${input.campaign_id as number}`;
      return { ok: true, campaign_id: input.campaign_id, new_status: input.status };
    }

    case "get_daily_plan": {
      return {
        campaign: CAMPAIGN_NAME,
        days: DAILY_SEARCH_QUERIES,
        angles: ["pain_point_time", "pain_point_cost", "social_proof", "free_bonus", "tech_innovation", "competitor_gap", "question_hook"],
        rotation: "angle = (dayNumber + leadIndex) % 7",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
