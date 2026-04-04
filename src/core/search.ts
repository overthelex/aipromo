import chalk from "chalk";
import { UnipileService } from "../services/unipile.service.js";
import { sql } from "../storage/store.js";
import { logger } from "../utils/logger.js";

function sanitize(s: string): string {
  return s.replace(/\0/g, "");
}

export interface SearchFilters {
  accountAlias?: string;
  keywords?: string;
  location?: string[];
  seniority?: string[];
  industry?: string[];
  title?: string;
  company?: string[];
  limit: number;
  save?: boolean;
  tag?: string;
}

export interface SearchResult {
  id: string;
  name: string;
  headline: string;
  location: string;
  profileUrl: string;
  networkDistance: string;
}

export async function searchLeads(opts: SearchFilters): Promise<SearchResult[]> {
  const unipile = new UnipileService(opts.accountAlias);
  const accountId = unipile.accountId;
  const results: SearchResult[] = [];
  let cursor: string | undefined;

  while (results.length < opts.limit) {
    const body: Record<string, unknown> = {
      api: "classic",
      category: "people",
    };

    if (opts.keywords) body.keywords = opts.keywords;
    if (opts.location?.length) body.location = opts.location;
    if (opts.seniority?.length) body.seniority = opts.seniority;
    if (opts.industry?.length) body.industry = opts.industry;
    if (opts.title) body.title = opts.title;
    if (opts.company?.length) body.company = opts.company;
    body.limit = Math.min(opts.limit - results.length, 25);
    if (cursor) body.cursor = cursor;

    const data = await unipile.searchPeople(body);

    if (data.items.length === 0) break;

    for (const item of data.items) {
      if (results.length >= opts.limit) break;

      results.push({
        id: item.id,
        name: sanitize(item.name ?? ""),
        headline: sanitize(item.headline ?? ""),
        location: sanitize(item.location ?? ""),
        profileUrl: item.public_profile_url ?? item.profile_url ?? "",
        networkDistance: item.network_distance ?? "",
      });
    }

    cursor = data.cursor;
    if (!cursor) break;

    if (results.length % 25 === 0) {
      process.stdout.write(chalk.dim(`  Found ${results.length} leads...\r`));
    }
  }

  // Save to DB if requested
  if (opts.save) {
    let saved = 0;
    for (const r of results) {
      const tags = opts.tag ?? "search";
      await sql`
        INSERT INTO leads (account_id, linkedin_id, name, headline, location, profile_url, tags, source)
        VALUES (${accountId}, ${r.id}, ${r.name}, ${r.headline}, ${r.location}, ${r.profileUrl}, ${tags}, 'search')
        ON CONFLICT (account_id, linkedin_id)
        DO UPDATE SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
          headline = COALESCE(NULLIF(EXCLUDED.headline, ''), leads.headline),
          location = COALESCE(NULLIF(EXCLUDED.location, ''), leads.location),
          tags = CASE
            WHEN leads.tags = '' THEN EXCLUDED.tags
            WHEN leads.tags LIKE '%' || ${tags} || '%' THEN leads.tags
            ELSE leads.tags || ',' || EXCLUDED.tags
          END
      `;
      saved++;
    }
    logger.info({ saved, accountId }, "Search results saved to DB");
  }

  return results;
}

export interface SearchParamsOptions {
  accountAlias?: string;
  type: string;
  keyword: string;
}

export async function lookupSearchParam(opts: SearchParamsOptions): Promise<Array<{ id: string; title: string }>> {
  const unipile = new UnipileService(opts.accountAlias);
  const data = await unipile.getSearchParameters(opts.type, opts.keyword);
  return data.items.map((i: any) => ({ id: i.id, title: i.title }));
}
