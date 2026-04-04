import { UnipileService } from "../services/unipile.service.js";
import { sql } from "../storage/store.js";

export interface InboxOptions {
  unreadOnly: boolean;
  limit: number;
  accountAlias?: string;
}

export interface InboxConversation {
  chatId: string;
  attendeeName: string;
  attendeeId: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  isSenderLast: boolean;
}

export async function fetchInbox(
  opts: InboxOptions
): Promise<InboxConversation[]> {
  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;
  const result: InboxConversation[] = [];

  let cursor: string | undefined;
  let collected = 0;

  while (collected < opts.limit) {
    const page = await unipile.getChats(cursor);

    for (const chat of page.items) {
      if (collected >= opts.limit) break;

      const attendee = chat.attendees.find((a) => !a.is_self);
      if (!attendee) continue;

      const unreadCount = chat.unread_count ?? 0;

      if (opts.unreadOnly && unreadCount === 0) continue;

      const lastMsg = chat.last_message;
      const isSenderLast = lastMsg?.is_sender ?? false;

      // Skip if we already answered (our message is last)
      if (isSenderLast && !opts.unreadOnly) continue;

      const conv: InboxConversation = {
        chatId: chat.id,
        attendeeName: attendee.name,
        attendeeId: attendee.provider_id,
        lastMessagePreview: lastMsg
          ? lastMsg.text.slice(0, 80) + (lastMsg.text.length > 80 ? "..." : "")
          : "(no messages)",
        lastMessageAt: chat.timestamp,
        unreadCount,
        isSenderLast,
      };

      result.push(conv);
      collected++;

      // Upsert conversation in DB
      await sql`
        INSERT INTO conversations (account_id, chat_id, last_message_at, status)
        VALUES (${accountId}, ${chat.id}, ${chat.timestamp}, 'new')
        ON CONFLICT (chat_id)
        DO UPDATE SET last_message_at = ${chat.timestamp}
      `;
    }

    cursor = page.cursor;
    if (!cursor) break;
  }

  return result;
}
