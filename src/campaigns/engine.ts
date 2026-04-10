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
import { broadcast } from "../server.js";
import type { CampaignConfig } from "./types.js";

function clog(msg: string) {
  console.log(msg);
  broadcast("campaign_log", { msg: msg.replace(/\x1b\[[0-9;]*m/g, "") }); // strip ANSI colors
}

// Ukraine location ID for LinkedIn search
const UKRAINE_LOCATION_ID = "102264497";

function sanitize(s: string): string {
  return s.replace(/\0/g, "");
}

// --- Timezone-aware optimal send time ---

// Map location keywords to UTC offsets (summer time)
const TIMEZONE_MAP: Array<{ patterns: RegExp; utcOffset: number }> = [
  { patterns: /\b(kyiv|kiev|kharkiv|odessa|odesa|lviv|dnipro|zaporizhzhia|mykolaiv|chernihiv|sumy|poltava|vinnytsia|zhytomyr|rivne|lutsk|ternopil|ivano-frankivsk|uzhhorod|chernivtsi|kherson|kropyvnytskyi|vyshhorod|ukraine|україна|київ|одеса|харків|львів|дніпро)\b/i, utcOffset: 3 },
  { patterns: /\b(warsaw|krakow|gdansk|wroclaw|poland|polska|berlin|munich|hamburg|frankfurt|germany|deutschland|paris|france|amsterdam|netherlands|brussels|belgium|vienna|austria|rome|milan|italy|madrid|barcelona|spain|prague|czech|zurich|switzerland|stockholm|sweden|oslo|norway|copenhagen|denmark|helsinki|finland|budapest|hungary|bucharest|romania|sofia|bulgaria|athens|greece|zagreb|croatia|belgrade|serbia|bratislava|slovakia|ljubljana|slovenia|lisbon|portugal|dublin|ireland|tallinn|estonia|riga|latvia|vilnius|lithuania)\b/i, utcOffset: 2 },
  { patterns: /\b(london|manchester|birmingham|uk|united kingdom|britain|england|scotland|wales)\b/i, utcOffset: 1 },
  { patterns: /\b(new york|boston|washington|philadelphia|miami|atlanta|charlotte|us east|est |eastern)\b/i, utcOffset: -4 },
  { patterns: /\b(chicago|dallas|houston|austin|denver|us central|cst |central)\b/i, utcOffset: -5 },
  { patterns: /\b(los angeles|san francisco|seattle|portland|us west|pst |pacific)\b/i, utcOffset: -7 },
  { patterns: /\b(toronto|montreal|ottawa|canada|vancouver)\b/i, utcOffset: -4 },
  { patterns: /\b(dubai|uae|abu dhabi|emirates)\b/i, utcOffset: 4 },
  { patterns: /\b(istanbul|turkey|türkiye|ankara)\b/i, utcOffset: 3 },
  { patterns: /\b(tel aviv|jerusalem|israel)\b/i, utcOffset: 3 },
  { patterns: /\b(tbilisi|georgia|საქართველო)\b/i, utcOffset: 4 },
  { patterns: /\b(singapore)\b/i, utcOffset: 8 },
  { patterns: /\b(tokyo|japan)\b/i, utcOffset: 9 },
  { patterns: /\b(sydney|melbourne|australia)\b/i, utcOffset: 10 },
  { patterns: /\b(mumbai|delhi|bangalore|india)\b/i, utcOffset: 5.5 },
];

// Optimal local hours for sending LinkedIn messages (recipient's local time)
// Tue-Thu 8-10am, 12-1pm, 4-6pm — best engagement windows
const OPTIMAL_LOCAL_HOURS = [8, 9, 10, 12, 16, 17];

function getUtcOffset(location: string): number {
  if (!location) return 3; // Default: Ukraine UTC+3
  for (const { patterns, utcOffset } of TIMEZONE_MAP) {
    if (patterns.test(location)) return utcOffset;
  }
  return 3; // Default: Ukraine
}

function isOptimalHourForLocation(location: string): boolean {
  const offset = getUtcOffset(location);
  const localHour = (new Date().getUTCHours() + offset + 24) % 24;
  return OPTIMAL_LOCAL_HOURS.includes(Math.floor(localHour));
}

function getNextOptimalSendTime(location: string): Date {
  const offset = getUtcOffset(location);
  const now = new Date();
  const localHour = (now.getUTCHours() + offset + 24) % 24;

  // Find next optimal hour
  let hoursToWait = 0;
  for (let h = 1; h <= 24; h++) {
    const candidateLocal = (localHour + h) % 24;
    if (OPTIMAL_LOCAL_HOURS.includes(candidateLocal)) {
      hoursToWait = h;
      break;
    }
  }

  // Add random jitter (0-30 min) to avoid sending all at :00
  const jitterMs = Math.random() * 30 * 60 * 1000;
  return new Date(now.getTime() + hoursToWait * 3600_000 + jitterMs);
}

function isOptimalHourForCampaign(cam: CampaignConfig): boolean {
  const hour = new Date().getUTCHours();
  return cam.optimalHoursUtc.includes(hour);
}

function randomDelay(minSec: number, maxSec: number): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000;
}

// --- Outreach System Prompt ---

const INVITATION_NOTE_LIMIT = 290;

function getOutreachSystemPrompt(campaign: CampaignConfig, angle: string, channel: "linkedin" | "instagram", maxChars?: number): string {
  const charLimit = maxChars
    ? `\n- HARD LIMIT: message MUST be under ${maxChars} characters total (this is a LinkedIn invitation note limit). Count carefully. Be concise — 2-3 short sentences max.`
    : "";
  const channelRules = channel === "instagram"
    ? `- This is an Instagram DM — be casual and brief, 2-3 sentences MAX
- Don't mention LinkedIn or connection requests
- Use a friendly, approachable tone suitable for Instagram`
    : `- ${maxChars ? "2-3 sentences MAX" : "3-5 sentences MAX"}. LinkedIn messages must be short.${charLimit}`;

  return `You are writing a ${channel === "instagram" ? "Instagram DM" : "LinkedIn first-touch message"} for the ${campaign.name} campaign.

${campaign.productContext}

MESSAGE ANGLE for this specific message: "${angle}"
${campaign.getAngleInstruction(angle)}

CRITICAL RULES:
- Write in Ukrainian (unless lead profile is clearly English-only)
${channelRules}
- Start with something specific to THIS person's profile (their headline, company, role, location)
- DO NOT start with generic "Привіт, [name]" — find a creative opener based on their work
- DO NOT list all features — focus on ONE angle from above
- End with a soft CTA — question or invitation to see a demo
- Be warm, professional, NOT salesy or spammy
- NEVER copy-paste the same message structure — each message must feel hand-written
- Do NOT use bullet points or numbered lists
- Output ONLY the message text, nothing else`;
}

// --- Auto-Responder System Prompt ---

function getResponderSystemPrompt(campaign: CampaignConfig): string {
  return `You are a helpful sales assistant responding to incoming messages for the ${campaign.name} campaign.

${campaign.productContext}

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
  campaign: CampaignConfig;
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
  scheduled: number;
  instagramDMs: number;
}> {
  const cam = opts.campaign;
  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;
  const claude = new ClaudeService();

  const dayQuery = cam.dailySearchQueries[(opts.dayNumber - 1) % cam.dailySearchQueries.length];

  clog(chalk.bold(`\n=== ${cam.name} — Day ${opts.dayNumber} ===`));
  clog(chalk.dim(`Channels: ${cam.channels.join(", ")}`));
  clog(chalk.dim(`Search: "${dayQuery.keywords}" | Title: "${dayQuery.title}"`));
  clog(chalk.dim(`Optimal hour: ${isOptimalHourForCampaign(cam) ? "YES" : "NO (sending anyway)"}\n`));

  // --- Phase 1: Search new leads ---
  clog(chalk.bold("Phase 1: Searching new leads...\n"));

  const searchResults = await searchLeads({
    accountAlias: opts.accountAlias,
    keywords: dayQuery.keywords,
    location: [UKRAINE_LOCATION_ID],
    title: dayQuery.title,
    limit: opts.maxNewLeads,
    save: true,
    tag: `campaign-${cam.name}-d${opts.dayNumber}`,
  });

  clog(chalk.green(`  Found ${searchResults.length} new leads\n`));

  // --- Phase 2: Send LinkedIn outreach to unsent leads ---
  clog(chalk.bold("Phase 2: Sending LinkedIn outreach...\n"));

  const leadsToMessage = await sql`
    SELECT l.* FROM leads l
    WHERE l.account_id = ${accountId}
      AND l.tags LIKE ${'%campaign-' + cam.name + '%'}
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
  let [campaignRow] = await sql`
    SELECT id FROM outreach_campaigns
    WHERE account_id = ${accountId} AND name = ${cam.name}
  `;
  if (!campaignRow) {
    [campaignRow] = await sql`
      INSERT INTO outreach_campaigns (account_id, name, template, target_tags, status)
      VALUES (${accountId}, ${cam.name}, 'hyper-personalized', ${cam.name}, 'active')
      RETURNING id
    `;
  }

  let sentCount = 0;
  let scheduledCount = 0;

  for (let i = 0; i < leadsToMessage.length; i++) {
    const lead = leadsToMessage[i];

    const profile: LeadProfile = {
      name: sanitize(lead.name),
      headline: sanitize(lead.headline),
      company: sanitize(lead.company),
      title: sanitize(lead.title),
      location: sanitize(lead.location),
    };

    const angle = cam.getMessageAngle(opts.dayNumber, i);

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

    // Check if now is optimal for this lead's timezone
    const leadLocation = lead.location || "";
    if (!opts.dryRun && !isOptimalHourForLocation(leadLocation)) {
      const sendAt = getNextOptimalSendTime(leadLocation);
      const offset = getUtcOffset(leadLocation);
      const localHour = (new Date().getUTCHours() + offset + 24) % 24;

      const systemPrompt = getOutreachSystemPrompt(cam, angle, "linkedin");
      const message = await claude.generateWithSystem(systemPrompt, userPrompt);

      await sql`
        INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status, message_angle, scheduled_at)
        VALUES (${campaignRow.id}, ${lead.id}, ${message}, 'scheduled', ${angle}, ${sendAt})
      `;
      scheduledCount++;
      clog(chalk.blue(`  ⏱ ${profile.name} [${angle}] scheduled for ${sendAt.toISOString().slice(11, 16)} UTC (local ${Math.floor(((sendAt.getUTCHours() + offset + 24) % 24))}:00, now ${Math.floor(localHour)}:00, UTC+${offset})`));
      continue;
    }

    const canSend = await checkAndIncrementDaily(accountId, "message", appConfig.maxMessagesPerDay);
    if (!canSend) {
      clog(chalk.yellow(`  Daily limit reached (${appConfig.maxMessagesPerDay}). Stopping outreach.`));
      break;
    }

    if (!checkPerMinuteLimit(`msg:${accountId}`, 5)) {
      clog(chalk.dim("  Throttling (5/min limit)... waiting 30s"));
      await sleep(30000);
    }

    const systemPrompt = getOutreachSystemPrompt(cam, angle, "linkedin");
    const message = await claude.generateWithSystem(systemPrompt, userPrompt);

    if (opts.dryRun) {
      console.log(`  ${chalk.bold(profile.name)} [${chalk.cyan(angle)}]:`);
      console.log(`  ${chalk.green(message)}\n`);
    } else {
      const [queued] = await sql`
        INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status, message_angle)
        VALUES (${campaignRow.id}, ${lead.id}, ${message}, 'pending', ${angle})
        RETURNING id
      `;
      try {
        const chatId = await unipile.startChat(lead.linkedin_id, message);
        sentCount++;

        await sql`UPDATE outreach_queue SET status = 'sent', sent_at = NOW() WHERE id = ${queued.id}`;
        await sql`UPDATE leads SET status = 'contacted' WHERE id = ${lead.id} AND status = 'prospect'`;

        for (const dayOffset of [3, 5, 7]) {
          await sql`
            INSERT INTO follow_ups (lead_id, account_id, campaign_id, step, scheduled_for, status)
            VALUES (${lead.id}, ${accountId}, ${campaignRow.id}, ${dayOffset === 3 ? 1 : dayOffset === 5 ? 2 : 3},
              NOW() + ${dayOffset + ' days'}::interval, 'pending')
          `;
        }

        await sql`
          INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
          VALUES (NULL, ${'outreach-' + lead.id + '-' + Date.now()}, ${chatId}, ${accountId}, ${message}, true, 'OUTREACH', NOW(), true)
          ON CONFLICT (message_id) DO NOTHING
        `;

        clog(chalk.green(`  ✓ ${profile.name} [${angle}]`));
        await sleep(randomDelay(10, 25));
      } catch (err: any) {
        if (err.message?.includes('unreachable') || err.message?.includes('422')) {
          let invSent = false;

          let note: string;
          if (message.length <= INVITATION_NOTE_LIMIT) {
            note = message;
          } else {
            clog(chalk.dim(`  Regenerating short note for ${profile.name} (${message.length} > ${INVITATION_NOTE_LIMIT})...`));
            const shortPrompt = getOutreachSystemPrompt(cam, angle, "linkedin", INVITATION_NOTE_LIMIT);
            note = await claude.generateWithSystem(shortPrompt, userPrompt);
            if (note.length > INVITATION_NOTE_LIMIT) {
              const trimmed = note.slice(0, INVITATION_NOTE_LIMIT);
              const lastSentence = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("? "), trimmed.lastIndexOf("! "));
              note = lastSentence > INVITATION_NOTE_LIMIT * 0.5
                ? trimmed.slice(0, lastSentence + 1)
                : trimmed.slice(0, trimmed.lastIndexOf(" ")) + "...";
              logger.warn({ lead: profile.name, length: note.length }, "Invitation note trimmed at sentence boundary");
            }
          }

          for (let retry = 0; retry < 2 && !invSent; retry++) {
            try {
              if (retry > 0) await sleep(5000);
              await unipile.sendInvitation(lead.linkedin_id, note);
              await incrementDailyCount(accountId, "invitation");
              sentCount++;
              await sql`UPDATE outreach_queue SET status = 'sent', message_text = ${note}, sent_at = NOW() WHERE id = ${queued.id}`;
              await sql`UPDATE leads SET status = 'contacted' WHERE id = ${lead.id} AND status = 'prospect'`;
              clog(chalk.yellow(`  → ${profile.name} [invitation + note, ${note.length} chars]`));
              invSent = true;
            } catch (invErr: any) {
              if (retry === 1) {
                await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${queued.id}`;
                clog(chalk.red(`  ✗ ${profile.name}: ${invErr.message}`));
              }
            }
          }
          if (invSent) await sleep(randomDelay(10, 25));
        } else {
          await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${queued.id}`;
          clog(chalk.red(`  ✗ ${profile.name}: ${err.message}`));
        }
      }
    }
  }

  clog(chalk.bold(`\n  LinkedIn outreach: ${opts.dryRun ? leadsToMessage.length + " previewed" : sentCount + " sent" + (scheduledCount ? `, ${scheduledCount} scheduled` : "")}\n`));

  // --- Phase 2b: Instagram DM outreach ---
  let igDMCount = 0;
  if (cam.channels.includes("instagram") && cam.instagramAccountId) {
    clog(chalk.bold("Phase 2b: Instagram DM outreach...\n"));
    igDMCount = await sendInstagramDMs(cam, campaignRow.id, accountId, claude, opts);
  }

  // --- Phase 2c: Send scheduled messages whose time has come ---
  if (!opts.dryRun) {
    const scheduledSent = await processScheduledOutreach(unipile, accountId);
    if (scheduledSent > 0) {
      sentCount += scheduledSent;
      clog(chalk.green(`  + ${scheduledSent} scheduled messages sent`));
    }
  }

  // --- Phase 3: Reply to incoming messages ---
  clog(chalk.bold("Phase 3: Processing incoming replies...\n"));

  let repliedCount = 0;
  const chatsPage = await unipile.getChats();

  for (const chat of chatsPage.items) {
    if ((chat.unread_count ?? 0) === 0) continue;

    const attendeeId = chat.attendee_provider_id ?? "";
    const campaignLead = await sql`
      SELECT l.* FROM leads l
      JOIN outreach_queue oq ON oq.lead_id = l.id
      JOIN outreach_campaigns oc ON oc.id = oq.campaign_id
      WHERE l.linkedin_id = ${attendeeId}
        AND l.account_id = ${accountId}
        AND oc.name = ${cam.name}
        AND oq.status = 'sent'
      LIMIT 1
    `;

    if (campaignLead.length === 0) continue;

    const lead = campaignLead[0];

    const messagesPage = await unipile.getChatMessages(chat.id);
    const messages = messagesPage.items.reverse();

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.is_sender) continue;

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

    const reply = await claude.generateWithSystem(getResponderSystemPrompt(cam), replyPrompt);

    if (opts.dryRun) {
      console.log(`  ${chalk.bold(profile.name)} replied: "${chalk.dim(lastMsg.text.slice(0, 80))}"`);
      console.log(`  ${chalk.green("Draft reply: " + reply)}\n`);
    } else {
      try {
        await unipile.sendMessage(chat.id, reply);
        await incrementDailyCount(accountId, "message");
        repliedCount++;

        const convRow = await sql`SELECT id FROM conversations WHERE chat_id = ${chat.id} LIMIT 1`;
        const convId = convRow.length > 0 ? convRow[0].id : null;

        await sql`
          INSERT INTO messages (conversation_id, message_id, chat_id, sender_id, text, is_sender, message_type, timestamp, seen)
          VALUES (${convId}, ${'reply-' + chat.id + '-' + Date.now()}, ${chat.id}, ${accountId}, ${reply}, true, 'CAMPAIGN_REPLY', NOW(), true)
          ON CONFLICT (message_id) DO NOTHING
        `;

        await sql`UPDATE conversations SET unread_count = 0, status = 'read' WHERE chat_id = ${chat.id}`;

        clog(chalk.green(`  ↩ Replied to ${profile.name}`));
        await sleep(randomDelay(8, 15));
      } catch (err: any) {
        logger.error({ lead: profile.name, error: err.message }, "Campaign reply failed");
        clog(chalk.red(`  ✗ Reply failed for ${profile.name}: ${err.message}`));
      }
    }
  }

  clog(chalk.bold(`\n  Replies: ${opts.dryRun ? "preview mode" : repliedCount + " sent"}`));

  // --- Phase 4: Process due follow-ups ---
  let followUpCount = 0;
  if (!opts.dryRun) {
    clog(chalk.bold("\nPhase 4: Processing follow-ups...\n"));
    const { processDueFollowUps } = await import("../core/follow-ups.js");
    followUpCount = await processDueFollowUps(cam, opts.accountAlias);
    clog(chalk.bold(`\n  Follow-ups: ${followUpCount} sent`));
  }

  return {
    searched: searchResults.length,
    messaged: opts.dryRun ? leadsToMessage.length : sentCount,
    replied: repliedCount,
    followUps: followUpCount,
    scheduled: scheduledCount,
    instagramDMs: igDMCount,
  };
}

// --- Instagram DM outreach ---
// Sends hyper-personalized Instagram DMs to contacted leads who haven't been reached via IG yet

async function sendInstagramDMs(
  cam: CampaignConfig,
  campaignId: number,
  linkedinAccountId: string,
  claude: ClaudeService,
  opts: RunCampaignDayOptions,
): Promise<number> {
  const igAccountId = cam.instagramAccountId!;

  // Get contacted leads from this campaign that haven't received an IG DM yet
  const leads = await sql`
    SELECT l.* FROM leads l
    JOIN outreach_queue oq ON oq.lead_id = l.id
    WHERE oq.campaign_id = ${campaignId}
      AND oq.status = 'sent'
      AND l.id NOT IN (
        SELECT oq2.lead_id FROM outreach_queue oq2
        WHERE oq2.lead_id IS NOT NULL
          AND oq2.message_angle LIKE 'ig_%'
      )
    ORDER BY oq.sent_at ASC
    LIMIT ${Math.min(opts.maxMessages, 10)}
  `;

  if (leads.length === 0) {
    clog(chalk.dim("  No leads pending for Instagram DM"));
    return 0;
  }

  let sent = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const profile: LeadProfile = {
      name: sanitize(lead.name),
      headline: sanitize(lead.headline),
      company: sanitize(lead.company),
      title: sanitize(lead.title),
      location: sanitize(lead.location),
    };

    // Try to find their name on Instagram — use LinkedIn name
    // Instagram DMs via Unipile use attendee_provider_id which is their IG username
    // We'll try to match by name; if we can't find them, skip
    const igAngle = "ig_" + cam.getMessageAngle(opts.dayNumber, i);
    const systemPrompt = getOutreachSystemPrompt(cam, igAngle.replace("ig_", ""), "instagram");

    const userPrompt = [
      `Lead profile:`,
      `- Name: ${profile.name}`,
      profile.headline ? `- Headline: ${profile.headline}` : null,
      profile.company ? `- Company: ${profile.company}` : null,
      profile.title ? `- Title: ${profile.title}` : null,
      profile.location ? `- Location: ${profile.location}` : null,
      ``,
      `This person was already contacted on LinkedIn. Now write a short Instagram DM as a second touchpoint.`,
      `Don't repeat the LinkedIn message. Offer something new — a free audit, a quick demo link, or an interesting insight.`,
      `Keep it very casual and brief — 2 sentences max.`,
    ].filter(Boolean).join("\n");

    const message = await claude.generateWithSystem(systemPrompt, userPrompt);

    if (opts.dryRun) {
      console.log(`  ${chalk.magenta("[IG]")} ${chalk.bold(profile.name)} [${chalk.cyan(igAngle)}]:`);
      console.log(`  ${chalk.green(message)}\n`);
      sent++;
    } else {
      const [queued] = await sql`
        INSERT INTO outreach_queue (campaign_id, lead_id, message_text, status, message_angle)
        VALUES (${campaignId}, ${lead.id}, ${message}, 'pending', ${igAngle})
        RETURNING id
      `;
      try {
        // Use Instagram account to start chat by LinkedIn name (best-effort)
        const baseUrl = `https://${appConfig.unipileDsn}/api/v1`;
        const res = await fetch(`${baseUrl}/chats`, {
          method: "POST",
          headers: {
            "X-API-KEY": appConfig.unipileAccessToken,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            account_id: igAccountId,
            attendees_ids: [lead.linkedin_id],
            text: message,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Instagram DM failed: ${res.status} — ${text}`);
        }

        await sql`UPDATE outreach_queue SET status = 'sent', sent_at = NOW() WHERE id = ${queued.id}`;
        sent++;
        clog(chalk.magenta(`  ✓ [IG] ${profile.name}`));
        await sleep(randomDelay(15, 40)); // Longer delays for IG
      } catch (err: any) {
        await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${queued.id}`;
        clog(chalk.red(`  ✗ [IG] ${profile.name}: ${err.message}`));
      }
    }
  }

  clog(chalk.bold(`\n  Instagram DMs: ${opts.dryRun ? sent + " previewed" : sent + " sent"}\n`));
  return sent;
}

// --- Process scheduled outreach messages whose send time has arrived ---

export async function processScheduledOutreach(
  unipile: UnipileService,
  accountId: string,
): Promise<number> {
  const due = await sql`
    SELECT oq.*, l.linkedin_id, l.name, l.location
    FROM outreach_queue oq
    JOIN leads l ON oq.lead_id = l.id
    WHERE oq.status = 'scheduled'
      AND oq.scheduled_at <= NOW()
    ORDER BY oq.scheduled_at ASC
    LIMIT 30
  `;

  if (due.length === 0) return 0;
  clog(chalk.bold(`\nProcessing ${due.length} scheduled messages...\n`));

  let sent = 0;
  for (const item of due) {
    const canSend = await checkAndIncrementDaily(accountId, "message", appConfig.maxMessagesPerDay);
    if (!canSend) {
      clog(chalk.yellow(`  Daily limit reached. Remaining scheduled messages deferred.`));
      break;
    }

    if (!checkPerMinuteLimit(`msg:${accountId}`, 5)) {
      await sleep(30000);
    }

    try {
      const chatId = await unipile.startChat(item.linkedin_id, item.message_text);
      await sql`UPDATE outreach_queue SET status = 'sent', sent_at = NOW() WHERE id = ${item.id}`;
      await sql`UPDATE leads SET status = 'contacted' WHERE id = ${item.lead_id} AND status = 'prospect'`;
      sent++;
      clog(chalk.green(`  ✓ ${item.name} [scheduled]`));
      await sleep(randomDelay(10, 25));
    } catch (err: any) {
      if (err.message?.includes('unreachable') || err.message?.includes('422')) {
        let note = item.message_text;
        if (note.length > INVITATION_NOTE_LIMIT) {
          const trimmed = note.slice(0, INVITATION_NOTE_LIMIT);
          const lastSentence = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("? "), trimmed.lastIndexOf("! "));
          note = lastSentence > INVITATION_NOTE_LIMIT * 0.5
            ? trimmed.slice(0, lastSentence + 1)
            : trimmed.slice(0, trimmed.lastIndexOf(" ")) + "...";
        }
        try {
          await unipile.sendInvitation(item.linkedin_id, note);
          await incrementDailyCount(accountId, "invitation");
          await sql`UPDATE outreach_queue SET status = 'sent', message_text = ${note}, sent_at = NOW() WHERE id = ${item.id}`;
          await sql`UPDATE leads SET status = 'contacted' WHERE id = ${item.lead_id} AND status = 'prospect'`;
          sent++;
          clog(chalk.yellow(`  → ${item.name} [scheduled, invitation + note]`));
          await sleep(randomDelay(10, 25));
        } catch (invErr: any) {
          await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${item.id}`;
          clog(chalk.red(`  ✗ ${item.name}: ${invErr.message}`));
        }
      } else {
        await sql`UPDATE outreach_queue SET status = 'failed' WHERE id = ${item.id}`;
        clog(chalk.red(`  ✗ ${item.name}: ${err.message}`));
      }
    }
  }
  return sent;
}
