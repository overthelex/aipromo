import inquirer from "inquirer";
import chalk from "chalk";
import { UnipileService } from "../services/unipile.service.js";
import { ClaudeService, type LeadProfile } from "../services/claude.service.js";
import { fetchInbox } from "./inbox.js";
import { sql } from "../storage/store.js";
import {
  checkDailyLimit,
  incrementDailyCount,
} from "../utils/rate-limiter.js";
import { appConfig } from "../config.js";

export interface ResponderOptions {
  dryRun: boolean;
  limit: number;
}

export async function runResponder(opts: ResponderOptions): Promise<void> {
  const unipile = new UnipileService();
  const claude = new ClaudeService();

  const conversations = await fetchInbox({
    unreadOnly: false,
    limit: opts.limit,
  });

  if (conversations.length === 0) {
    console.log(chalk.green("No conversations to respond to."));
    return;
  }

  console.log(
    chalk.bold(`Found ${conversations.length} conversation(s) to review.\n`)
  );

  for (const conv of conversations) {
    // Check daily limit
    const canSend = await checkDailyLimit(
      "message",
      appConfig.maxMessagesPerDay
    );
    if (!canSend) {
      console.log(
        chalk.yellow(
          `Daily message limit reached (${appConfig.maxMessagesPerDay}). Stopping.`
        )
      );
      break;
    }

    // Fetch messages
    const messagesPage = await unipile.getChatMessages(conv.chatId);
    const messages = messagesPage.items.reverse(); // oldest first

    // Build lead profile
    const lead: LeadProfile = {
      name: conv.attendeeName,
    };

    // Try to enrich from DB
    const dbLeads = await sql`
      SELECT headline, company, title, location
      FROM leads WHERE linkedin_id = ${conv.attendeeId}
    `;
    if (dbLeads.length > 0) {
      lead.headline = dbLeads[0].headline;
      lead.company = dbLeads[0].company;
      lead.title = dbLeads[0].title;
      lead.location = dbLeads[0].location;
    }

    // Show conversation
    console.log(chalk.bold(`\n--- ${conv.attendeeName} ---`));
    for (const msg of messages.slice(-5)) {
      const sender = msg.is_sender
        ? chalk.blue(appConfig.senderName || "Me")
        : chalk.yellow(conv.attendeeName);
      console.log(`  ${sender}: ${msg.text}`);
    }

    // Generate AI draft
    console.log(chalk.dim("\nGenerating AI response..."));
    const draft = await claude.generateReply(messages, lead);

    console.log(chalk.green(`\nDraft: ${draft}`));

    // Save draft to DB
    const convRows = await sql`
      SELECT id FROM conversations WHERE chat_id = ${conv.chatId}
    `;
    const conversationId = convRows.length > 0 ? convRows[0].id : null;

    if (conversationId) {
      await sql`
        INSERT INTO drafts (conversation_id, draft_text, status)
        VALUES (${conversationId}, ${draft}, 'pending')
      `;
    }

    if (opts.dryRun) {
      console.log(chalk.dim("(dry run — not sending)"));
      continue;
    }

    // Approve/edit/reject
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Action:",
        choices: [
          { name: "Send as-is", value: "send" },
          { name: "Edit before sending", value: "edit" },
          { name: "Skip", value: "skip" },
          { name: "Stop (exit)", value: "stop" },
        ],
      },
    ]);

    if (action === "stop") break;
    if (action === "skip") continue;

    let finalText = draft;

    if (action === "edit") {
      const { edited } = await inquirer.prompt([
        {
          type: "editor",
          name: "edited",
          message: "Edit the message:",
          default: draft,
        },
      ]);
      finalText = edited.trim();
      if (!finalText) {
        console.log(chalk.yellow("Empty message — skipping."));
        continue;
      }
    }

    // Send
    await unipile.sendMessage(conv.chatId, finalText);
    await incrementDailyCount("message");

    // Update draft status
    if (conversationId) {
      await sql`
        UPDATE drafts SET status = 'sent', sent_at = NOW()
        WHERE conversation_id = ${conversationId}
        AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    console.log(chalk.green("Sent!"));
  }
}
