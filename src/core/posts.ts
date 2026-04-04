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
  companyId?: string;
}

async function getAccountProviderId(unipile: UnipileService): Promise<string> {
  const accounts = await unipile.listAccounts();
  const account = accounts.find((a) => a.id === unipile.accountId);
  if (!account) throw new Error(`Account ${unipile.accountId} not found`);
  const connectionParams = (account as any).connection_params;
  const providerId = connectionParams?.im?.id;
  if (!providerId) throw new Error(`No provider_id for account ${unipile.accountId}`);
  return providerId;
}

async function fetchAndStorePosts(
  unipile: UnipileService,
  providerId: string,
  isCompany: boolean,
  maxPosts: number
): Promise<number> {
  const accountId = unipile.accountId;
  let postCount = 0;
  let cursor: string | undefined;

  while (postCount < maxPosts) {
    const page = await unipile.getUserPosts(providerId, cursor, isCompany);
    if (page.items.length === 0) break;

    for (const post of page.items) {
      if (postCount >= maxPosts) break;

      const text = sanitize(post.text ?? "");
      const authorName = sanitize(post.author?.name ?? "");
      const writtenByName = sanitize(post.written_by?.name ?? "");

      await sql`
        INSERT INTO posts (
          account_id, post_id, social_id, author_id, author_name,
          is_company_post, written_by_id, written_by_name,
          text, share_url, comment_count, reaction_count, repost_count,
          impressions_count, clicks, engagement_rate,
          is_repost, posted_at, synced_at
        )
        VALUES (
          ${accountId}, ${post.id}, ${post.social_id ?? ""}, ${post.author?.id ?? ""},
          ${authorName}, ${isCompany}, ${post.written_by?.id ?? ""},
          ${writtenByName}, ${text}, ${post.share_url ?? ""},
          ${post.comment_counter ?? 0}, ${post.reaction_counter ?? 0},
          ${post.repost_counter ?? 0}, ${post.impressions_counter ?? 0},
          ${post.analytics?.clicks ?? 0}, ${post.analytics?.engagement_rate ?? 0},
          ${post.is_repost ?? false}, ${post.parsed_datetime ?? null}, NOW()
        )
        ON CONFLICT (account_id, post_id)
        DO UPDATE SET
          comment_count = EXCLUDED.comment_count,
          reaction_count = EXCLUDED.reaction_count,
          repost_count = EXCLUDED.repost_count,
          impressions_count = EXCLUDED.impressions_count,
          clicks = EXCLUDED.clicks,
          engagement_rate = EXCLUDED.engagement_rate,
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

  return postCount;
}

export async function syncPosts(opts: SyncPostsOptions): Promise<number> {
  const unipile = new UnipileService(opts.accountAlias);
  const maxPosts = opts.limit ?? 500;

  const providerId = await getAccountProviderId(unipile);

  console.log(chalk.dim("  Syncing personal posts..."));
  const personalCount = await fetchAndStorePosts(unipile, providerId, false, maxPosts);
  logger.info({ personalCount, accountId: unipile.accountId }, "Personal posts synced");

  return personalCount;
}

export async function syncCompanyPosts(opts: SyncPostsOptions): Promise<number> {
  const unipile = new UnipileService(opts.accountAlias);
  const companyId = opts.companyId;
  if (!companyId) throw new Error("companyId is required");
  const maxPosts = opts.limit ?? 500;

  console.log(chalk.dim(`  Syncing company posts (${companyId})...`));
  const count = await fetchAndStorePosts(unipile, companyId, true, maxPosts);
  logger.info({ count, companyId, accountId: unipile.accountId }, "Company posts synced");

  return count;
}
