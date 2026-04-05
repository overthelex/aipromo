import chalk from "chalk";
import { UnipileService } from "../services/unipile.service.js";
import { ClaudeService, type LeadProfile } from "../services/claude.service.js";
import { sql } from "../storage/store.js";
import { searchLeads } from "../core/search.js";
import {
  checkDailyLimit,
  checkAndIncrementDaily,
  incrementDailyCount,
  checkPerMinuteLimit,
  sleep,
} from "../utils/rate-limiter.js";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import {
  CAMPAIGN_NAME,
  PRODUCT_CONTEXT,
  DAILY_SEARCH_QUERIES,
  OPTIMAL_HOURS_UTC,
  getMessageAngle,
} from "./registry-access-2w.js";

// Ukraine location ID for LinkedIn search
const UKRAINE_LOCATION_ID = "102264497";

function sanitize(s: string): string {
  return s.replace(/\0/g, "");
}

function isOptimalHour(): boolean {
  const hour = new Date().getUTCHours();
  return OPTIMAL_HOURS_UTC.includes(hour);
}

function randomDelay(minSec: number, maxSec: number): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000;
}

// --- Outreach System Prompt ---

function getOutreachSystemPrompt(angle: string): string {
  return `You are writing a LinkedIn first-touch message on behalf of the legal.org.ua team.

${PRODUCT_CONTEXT}

MESSAGE ANGLE for this specific message: "${angle}"
${getAngleInstruction(angle)}

CRITICAL RULES:
- Write in Ukrainian (unless lead profile is clearly English-only)
- 3-5 sentences MAX. LinkedIn messages must be short.
- Start with something specific to THIS person's profile (their headline, company, role, location)
- DO NOT start with generic "Привіт, [name]" — find a creative opener based on their work
- DO NOT list all features — focus on ONE angle from above
- End with a soft CTA — question or invitation to see a demo
- Be warm, professional, NOT salesy or spammy
- NEVER copy-paste the same message structure — each message must feel hand-written
- Do NOT mention the price unless the angle is "pain_point_cost"
- Do NOT use bullet points or numbered lists
- Output ONLY the message text, nothing else`;
}

function getAngleInstruction(angle: string): string {
  switch (angle) {
    case "pain_point_time":
      return "Focus on how much time lawyers waste on manual registry checks. Contrast with instant AI responses.";
    case "pain_point_cost":
      return "Focus on cost savings: 60-150 грн per extract via intermediaries vs 8 грн per query through legal.org.ua.";
    case "social_proof":
      return "Mention that AWS supports the platform, Google Cloud recognizes it as a high-scale AI project, and Ukrainian experts rate it 23/25.";
    case "free_bonus":
      return "Lead with the bonus: ALL databases (court decisions, company registry, debtor registry, parliament data) are FREE with any paid plan.";
    case "tech_innovation":
      return "Focus on tech: Дія.Підпис authentication, official НАІС API, AI-powered court decision analysis.";
    case "competitor_gap":
      return "Subtly note that no other platform in Ukraine offers official registry access through an AI chat interface.";
    case "question_hook":
      return "Start with a thought-provoking question about their daily work with registries or legal research.";
    default:
      return "";
  }
}

// --- Auto-Responder System Prompt ---

function getResponderSystemPrompt(): string {
  return `You are a helpful sales assistant for legal.org.ua responding to incoming LinkedIn messages.

${PRODUCT_CONTEXT}

RESPONSE RULES:
- Write in the same language the lead uses (Ukrainian or Russian or English)
- Be helpful, answer their specific question
- If they ask about pricing: mention Тариф «Бізнес» 4999 грн/міс with details
- If they ask about features: explain what's relevant to their question
- If they express interest: suggest a demo call or send them the article link
- If they have objections: address them professionally, don't argue
- If they say "не цікаво" or similar: thank them politely and stop
- Keep responses 2-4 sentences
- Be warm and professional, not pushy
- Output ONLY the reply text`;
}

// --- Campaign Runner ---

export interface RunCampaignDayOptions {
  accountAlias?: string;
  dayNumber: number;
  maxNewLeads: number;
  maxMessages: number;
  dryRun: boolean;
}

export async function runCampaignDay(opts: RunCampaignDayOptions): Promise<{
  searched: number;
  messaged: number;
  replied: number;
  followUps: number;
}> {
  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;
  const claude = new ClaudeService();

  const dayQuery = DAILY_SEARCH_QUERIES[(opts.dayNumber - 1) % DAILY_SEARCH_QUERIES.length];

  console.log(chalk.bold(`\n=== Campaign Day ${opts.dayNumber} ===`));
  console.log(chalk.dim(`Search: "${dayQuery.keywords}" | Title: "${dayQuery.title}"`));
  console.log(chalk.dim(`Optimal hour: ${isOptimalHour() ? "YES" : "NO (sending anyway)"}\n`));

  // --- Phase 1: Search new leads ---
  console.log(chalk.bold("Phase 1: Searching new leads...\n"));

  const searchResults = await searchLeads({
    accountAlias: opts.accountAlias,
    keywords: dayQuery.keywords,
    location: [UKRAINE_LOCATION_ID],
    title: dayQuery.title,
    limit: opts.maxNewLeads,
    save: true,
    tag: `campaign-${CAMPAIGN_NAME}-d${opts.dayNumber}`,
  });

  console.log(chalk.green(`  Found ${searchResults.length} new leads\n`));

  // --- Phase 2: Send outreach to unsent leads ---
  console.log(chalk.bold("Phase 2: Sending outreach messages...\n"));

  // Get leads tagged for this campaign that:
  // 1. Haven't been messaged in ANY campaign
  // 2. Don't have an existing conversation (already talked to)
  const leadsToMessage = await sql`
    SELECT l.* FROM leads l
    WHERE l.account_id = ${accountId}
      AND l.tags LIKE ${'%campaign-' + CAMPAIGN_NAME + '%'}
      AND l.id NOT IN (
        SELECT oq.lead_id FROM outreach_queue oq
        WHERE oq.lead_id IS NOT NULL AND oq.status = 'sent'
      )
      AND l.linkedin_id NOT IN (
        SELECT c.attendee_provider_id FROM conversations c
        WHERE c.account_id = ${accountId}
          AND c.attendee_provider_id != ''
      )
    ORDER BY l.imported_at DESC
    LIMIT ${opts.maxMessages}
  `;

  // Ensure campaign record exists
  let [campaign] = await sql`
    SELECT id FROM outreach_campaigns
    WHERE account_id = ${accountId} AND name = ${CAMPAIGN_NAME}
  `;
  if (!campaign) {
    [campaign] = await sql`
      INSERT INTO outreach_campaigns (account_id, name, template, target_tags, status)
      VALUES (${accountId}, ${CAMPAIGN_NAME}, 'hyper-personalized', ${CAMPAIGN_NAME}, 'active')
      RETURNING id
    `;
  }

  let sentCount = 0;

  for (let i = 0; i < leadsToMessage.length; i++) {
    const lead = leadsToMessage[i];

    const canSend = await checkAndIncrementDaily(accountId, "message", appConfig.maxMessagesPerDay);
    if (!canSend) {
      console.log(chalk.yellow(`  Daily limit reached (${appConfig.maxMessagesPerDay}). Stopping outreach.`));
      break;
    }

    // Per-minute throttle (max 5 messages/minute to avoid LinkedIn detection)
    if (!checkPerMinuteLimit(`msg:${accountId}`, 5)) {
      console.log(chalk.dim("  Throttling (5/min limit)... waiting 30s"));
      await sleep(30000);
    }

    const profile: LeadProfile = {
      name: sanitize(lead.name),
      headline: sanitize(lead.headline),
      company: sanitize(lead.company),
      title: sanitize(lead.title),
      location: sanitize(lead.location),
    };

    const angle = getMessageAngle(opts.dayNumber, i);
    const systemPrompt = getOutreachSystemPrompt(angle);

    const userPrompt = [
      `Lead profile:`,
      `- Name: ${profile.name}`,
      profile.headline ? `- Headline: ${profile.headline}` : null,
      profile.company ? `- Company: ${profile.company}` : null,
      profile.title ? `- Title: ${profile.title}` : null,
      profile.location ? `- Location: ${profile.location}` : null,
      ``,
      `Message angle: ${angle}`,
      `Day of campaign: ${opts.dayNumber}`,
      ``,
      `Write a hyper-personalized first message for this lead. Make it unique — never repeat the same structure.`,
    ].filter(Boolean).join("\n");

    const message = await claude.generateWithSystem(systemPrompt, userPrompt);

    if (opts.dryRun) {
      console.log(`  ${chalk.bold(profile.name)} [${chalk.cyan(angle)}]:`);
      console.log(`  ${chalk.green(message)}\n`);
    } else {
      // Reserve slot in outreach_queue BEFORE sending (idempotency)
      const [queued] = await sql`
        INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status, message_angle)
        VALUES (${campaign.id}, ${lead.id}, ${message}, 'pending', ${angle})
        RETURNING id
      `;
      try {
        // Try direct message first
        const chatId = await unipile.startChat(lead.linkedin_id, message);
        sentCount++;

        await sql`UPDATE outreach_queue SET status = 'sent', sent_at = NOW() WHERE id = ${queued.id}`;

        // Update lead status to 'contacted'
        await sql`UPDATE leads SET status = 'contacted' WHERE id = ${lead.id} AND status = 'prospect'`;

        // Schedule follow-ups (day+3, day+5, day+7)
        for (const dayOffset of [3, 5, 7]) {
          await sql`
            INSERT INTO follow_ups (lead_id, account_id, campaign_id, step, scheduled_for, status)
            VALUES (${lead.id}, ${accountId}, ${campaign.id}, ${dayOffset === 3 ? 1 : dayOffset === 5 ? 2 : 3},
              NOW() + ${dayOffset + ' days'}::interval, 'pending')
          `;
        }

        await sql`
          INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
          VALUES (NULL, ${'outreach-' + lead.id + '-' + Date.now()}, ${chatId}, ${accountId}, ${message}, true, 'OUTREACH', NOW(), true)
          ON CONFLICT (message_id) DO NOTHING
        `;

        console.log(chalk.green(`  ✓ ${profile.name} [${angle}]`));
        await sleep(randomDelay(10, 25));
      } catch (err: any) {
        // If direct message fails (unreachable), try connection request with note
        if (err.message?.includes('unreachable') || err.message?.includes('422')) {
          let invSent = false;
          const note = message.slice(0, 290);
          if (message.length > 290) logger.warn({ lead: profile.name, original: message.length }, "Invitation note truncated to 290 chars");
          for (let retry = 0; retry < 2 && !invSent; retry++) {
            try {
              if (retry > 0) await sleep(5000);
              await unipile.sendInvitation(lead.linkedin_id, note);
              await incrementDailyCount(accountId, "invitation");
              sentCount++;
              await sql`UPDATE outreach_queue SET status = 'sent', message_text = ${note}, sent_at = NOW() WHERE id = ${queued.id}`;
              await sql`UPDATE leads SET status = 'contacted' WHERE id = ${lead.id} AND status = 'prospect'`;
              console.log(chalk.yellow(`  → ${profile.name} [invitation + note]`));
              invSent = true;
            } catch (invErr: any) {
              if (retry === 1) {
                await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${queued.id}`;
                console.log(chalk.red(`  ✗ ${profile.name}: ${invErr.message}`));
              }
            }
          }
          if (invSent) await sleep(randomDelay(10, 25));
        } else {
          await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${queued.id}`;
          console.log(chalk.red(`  ✗ ${profile.name}: ${err.message}`));
        }
      }
    }
  }

  console.log(chalk.bold(`\n  Outreach: ${opts.dryRun ? leadsToMessage.length + " previewed" : sentCount + " sent"}\n`));

  // --- Phase 3: Reply to incoming messages ---
  console.log(chalk.bold("Phase 3: Processing incoming replies...\n"));

  let repliedCount = 0;
  const chatsPage = await unipile.getChats();

  for (const chat of chatsPage.items) {
    if ((chat.unread_count ?? 0) === 0) continue;

    // Check if this is from a campaign lead
    const attendeeId = chat.attendee_provider_id ?? "";
    const campaignLead = await sql`
      SELECT l.* FROM leads l
      JOIN outreach_queue oq ON oq.lead_id = l.id
      WHERE l.linkedin_id = ${attendeeId}
        AND l.account_id = ${accountId}
        AND oq.status = 'sent'
      LIMIT 1
    `;

    if (campaignLead.length === 0) continue;

    const lead = campaignLead[0];

    // Get conversation messages
    const messagesPage = await unipile.getChatMessages(chat.id);
    const messages = messagesPage.items.reverse();

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.is_sender) continue; // Skip if we sent last

    const profile: LeadProfile = {
      name: sanitize(lead.name),
      headline: sanitize(lead.headline),
      company: sanitize(lead.company),
      title: sanitize(lead.title),
      location: sanitize(lead.location),
    };

    const conversationContext = messages
      .slice(-6)
      .map((m) => `[${m.is_sender ? "Me" : profile.name}]: ${m.text}`)
      .join("\n");

    const replyPrompt = [
      `Lead profile:`,
      `- Name: ${profile.name}`,
      profile.headline ? `- Headline: ${profile.headline}` : null,
      ``,
      `Conversation:`,
      conversationContext,
      ``,
      `Generate a helpful reply to the lead's last message.`,
    ].filter(Boolean).join("\n");

    const reply = await claude.generateWithSystem(getResponderSystemPrompt(), replyPrompt);

    if (opts.dryRun) {
      console.log(`  ${chalk.bold(profile.name)} replied: "${chalk.dim(lastMsg.text.slice(0, 80))}"`);
      console.log(`  ${chalk.green("Draft reply: " + reply)}\n`);
    } else {
      try {
        await unipile.sendMessage(chat.id, reply);
        await incrementDailyCount(accountId, "message");
        repliedCount++;

        // Link to conversation
        const convRow = await sql`SELECT id FROM conversations WHERE chat_id = ${chat.id} LIMIT 1`;
        const convId = convRow.length > 0 ? convRow[0].id : null;

        await sql`
          INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
          VALUES (${convId}, ${'reply-' + chat.id + '-' + Date.now()}, ${chat.id}, ${accountId}, ${reply}, true, 'CAMPAIGN_REPLY', NOW(), true)
          ON CONFLICT (message_id) DO NOTHING
        `;

        // Mark as read after reply
        await sql`UPDATE conversations SET unread_count = 0, status = 'read' WHERE chat_id = ${chat.id}`;

        console.log(chalk.green(`  ↩ Replied to ${profile.name}`));
        await sleep(randomDelay(8, 15));
      } catch (err: any) {
        logger.error({ lead: profile.name, error: err.message }, "Campaign reply failed");
        console.log(chalk.red(`  ✗ Reply failed for ${profile.name}: ${err.message}`));
      }
    }
  }

  console.log(chalk.bold(`\n  Replies: ${opts.dryRun ? "preview mode" : repliedCount + " sent"}`));

  // --- Phase 4: Process due follow-ups ---
  let followUpCount = 0;
  if (!opts.dryRun) {
    console.log(chalk.bold("\nPhase 4: Processing follow-ups...\n"));
    const { processDueFollowUps } = await import("../core/follow-ups.js");
    followUpCount = await processDueFollowUps(opts.accountAlias);
    console.log(chalk.bold(`\n  Follow-ups: ${followUpCount} sent`));
  }

  return {
    searched: searchResults.length,
    messaged: opts.dryRun ? leadsToMessage.length : sentCount,
    replied: repliedCount,
    followUps: followUpCount,
  };
}
