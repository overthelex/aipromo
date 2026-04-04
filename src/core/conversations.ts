import chalk from "chalk";
import { UnipileService } from "../services/unipile.service.js";
import { sql } from "../storage/store.js";
import { logger } from "../utils/logger.js";

function sanitize(s: string): string {
  return s.replace(/\0/g, "");
}

export interface SyncConversationsOptions {
  accountAlias?: string;
  limit?: number;
  syncMessages?: boolean;
}

export async function syncConversations(
  opts: SyncConversationsOptions
): Promise<{ chats: number; messages: number }> {
  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;
  const maxChats = opts.limit ?? 1000;
  const syncMessages = opts.syncMessages ?? true;

  let chatCount = 0;
  let messageCount = 0;
  let cursor: string | undefined;

  while (chatCount < maxChats) {
    const page = await unipile.getChats(cursor);

    if (page.items.length === 0) break;

    for (const chat of page.items) {
      if (chatCount >= maxChats) break;

      const attendeeName = sanitize(chat.name ?? "");
      const subject = sanitize(chat.subject ?? "");
      const folder = (chat.folder ?? []).join(",");

      // Upsert conversation
      const [conv] = await sql`
        INSERT INTO conversations (
          account_id, chat_id, attendee_name, attendee_provider_id,
          subject, content_type, folder, unread_count,
          last_message_at, status, synced_at
        )
        VALUES (
          ${accountId}, ${chat.id}, ${attendeeName}, ${chat.attendee_provider_id ?? ""},
          ${subject}, ${chat.content_type ?? ""}, ${folder}, ${chat.unread_count ?? 0},
          ${chat.timestamp}, ${chat.unread_count > 0 ? "new" : "read"}, NOW()
        )
        ON CONFLICT (chat_id)
        DO UPDATE SET
          attendee_name = EXCLUDED.attendee_name,
          attendee_provider_id = EXCLUDED.attendee_provider_id,
          subject = EXCLUDED.subject,
          content_type = EXCLUDED.content_type,
          folder = EXCLUDED.folder,
          unread_count = EXCLUDED.unread_count,
          last_message_at = EXCLUDED.last_message_at,
          synced_at = NOW()
        RETURNING id
      `;

      // Link to lead if possible
      if (chat.attendee_provider_id) {
        const leads = await sql`
          SELECT id FROM leads
          WHERE account_id = ${accountId} AND linkedin_id = ${chat.attendee_provider_id}
          LIMIT 1
        `;
        if (leads.length > 0) {
          await sql`
            UPDATE conversations SET lead_id = ${leads[0].id} WHERE id = ${conv.id}
          `;
        }
      }

      chatCount++;

      // Sync messages for this chat
      if (syncMessages) {
        const msgCount = await syncChatMessages(unipile, conv.id, chat.id);
        messageCount += msgCount;
      }

      if (chatCount % 10 === 0) {
        process.stdout.write(
          chalk.dim(`  Synced ${chatCount} chats, ${messageCount} messages...\r`)
        );
      }
    }

    cursor = page.cursor;
    if (!cursor) break;
  }

  logger.info({ chatCount, messageCount, accountId }, "Conversations synced");
  return { chats: chatCount, messages: messageCount };
}

async function syncChatMessages(
  unipile: UnipileService,
  conversationId: number,
  chatId: string
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;

  // Check latest synced message to avoid re-fetching everything
  const latest = await sql`
    SELECT timestamp FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY timestamp DESC LIMIT 1
  `;
  const latestTimestamp = latest.length > 0 ? latest[0].timestamp : null;

  do {
    const page = await unipile.getChatMessages(chatId, cursor);

    if (page.items.length === 0) break;

    let reachedExisting = false;

    for (const msg of page.items) {
      // If we already have this message, stop paginating
      if (latestTimestamp && new Date(msg.timestamp) <= new Date(latestTimestamp)) {
        reachedExisting = true;
        break;
      }

      const text = sanitize(msg.text ?? "");

      await sql`
        INSERT INTO messages (
          conversation_id, message_id, chat_id, sender_id,
          text, is_sender, message_type, timestamp, seen
        )
        VALUES (
          ${conversationId}, ${msg.id}, ${msg.chat_id}, ${msg.sender_id},
          ${text}, ${Boolean(msg.is_sender)}, ${msg.message_type ?? ""},
          ${msg.timestamp}, ${Boolean(msg.seen)}
        )
        ON CONFLICT (message_id) DO UPDATE SET
          is_sender = EXCLUDED.is_sender,
          seen = EXCLUDED.seen
      `;
      count++;
    }

    if (reachedExisting) break;

    cursor = page.cursor;
  } while (cursor);

  return count;
}
