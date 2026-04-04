import chalk from "chalk";
import { UnipileService } from "../services/unipile.service.js";
import { sql } from "../storage/store.js";
import { logger } from "../utils/logger.js";

function sanitize(s: string): string {
  return s.replace(/\0/g, "");
}

export interface SyncPostsOptions {
  accountAlias?: string;
  limit?: number;
}

export async function syncPosts(
  opts: SyncPostsOptions
): Promise<number> {
  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;
  const maxPosts = opts.limit ?? 500;

  // Get account's own LinkedIn provider_id from the accounts API
  const accounts = await unipile.listAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const connectionParams = (account as any).connection_params;
  const providerId = connectionParams?.im?.id;
  if (!providerId) {
    throw new Error(`No LinkedIn provider_id found for account ${accountId}`);
  }

  let postCount = 0;
  let cursor: string | undefined;

  while (postCount < maxPosts) {
    const page = await unipile.getUserPosts(providerId, cursor);

    if (page.items.length === 0) break;

    for (const post of page.items) {
      if (postCount >= maxPosts) break;

      const text = sanitize(post.text ?? "");
      const authorName = sanitize(post.author?.name ?? "");

      await sql`
        INSERT INTO posts (
          account_id, post_id, social_id, author_id, author_name,
          text, share_url, comment_count, reaction_count, repost_count,
          impressions_count, is_repost, posted_at, synced_at
        )
        VALUES (
          ${accountId}, ${post.id}, ${post.social_id ?? ""}, ${post.author?.id ?? ""},
          ${authorName}, ${text}, ${post.share_url ?? ""},
          ${post.comment_counter ?? 0}, ${post.reaction_counter ?? 0},
          ${post.repost_counter ?? 0}, ${post.impressions_counter ?? 0},
          ${post.is_repost ?? false}, ${post.parsed_datetime ?? null}, NOW()
        )
        ON CONFLICT (account_id, post_id)
        DO UPDATE SET
          comment_count = EXCLUDED.comment_count,
          reaction_count = EXCLUDED.reaction_count,
          repost_count = EXCLUDED.repost_count,
          impressions_count = EXCLUDED.impressions_count,
          synced_at = NOW()
      `;
      postCount++;

      if (postCount % 10 === 0) {
        process.stdout.write(chalk.dim(`  Synced ${postCount} posts...\r`));
      }
    }

    cursor = page.cursor;
    if (!cursor) break;
  }

  logger.info({ postCount, accountId }, "Posts synced");
  return postCount;
}
