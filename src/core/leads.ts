import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { UnipileService } from "../services/unipile.service.js";
import { sql } from "../storage/store.js";
import { logger } from "../utils/logger.js";
import type { Lead } from "../types/lead.types.js";

function sanitize(s: string): string {
  return s.replace(/\0/g, "");
}

export async function syncLeads(accountAlias?: string): Promise<number> {
  const unipile = new UnipileService(accountAlias);
  const accountId = unipile.accountId;
  const relations = await unipile.getAllRelations();
  let count = 0;

  for (const r of relations) {
    const name = sanitize([r.first_name, r.last_name].filter(Boolean).join(" "));
    const headline = sanitize(r.headline ?? "");
    const profileUrl = sanitize(r.public_profile_url ?? "");

    await sql`
      INSERT INTO leads (account_id, linkedin_id, name, headline, profile_url, source)
      VALUES (
        ${accountId},
        ${r.member_id},
        ${name},
        ${headline},
        ${profileUrl},
        'connection'
      )
      ON CONFLICT (account_id, linkedin_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        headline = EXCLUDED.headline,
        profile_url = EXCLUDED.profile_url
    `;
    count++;
  }

  logger.info({ count, accountId }, "Leads synced from LinkedIn");
  return count;
}

export async function importLeadsFromCsv(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const records: Array<Record<string, string>> = [];

    createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (row: Record<string, string>) => records.push(row))
      .on("error", reject)
      .on("end", async () => {
        let count = 0;
        for (const row of records) {
          const linkedinId =
            row.linkedin_id || row.linkedin_url || row.profile_url || "";
          if (!linkedinId) continue;

          const accountId = row.account_id || "";

          await sql`
            INSERT INTO leads (account_id, linkedin_id, name, headline, company, title, location, profile_url, source)
            VALUES (
              ${accountId},
              ${linkedinId},
              ${row.name || ""},
              ${row.headline || ""},
              ${row.company || ""},
              ${row.title || ""},
              ${row.location || ""},
              ${row.profile_url || row.linkedin_url || ""},
              'csv'
            )
            ON CONFLICT (account_id, linkedin_id)
            DO UPDATE SET
              name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
              headline = COALESCE(NULLIF(EXCLUDED.headline, ''), leads.headline),
              company = COALESCE(NULLIF(EXCLUDED.company, ''), leads.company),
              title = COALESCE(NULLIF(EXCLUDED.title, ''), leads.title),
              location = COALESCE(NULLIF(EXCLUDED.location, ''), leads.location)
          `;
          count++;
        }
        logger.info({ count, filePath }, "Leads imported from CSV");
        resolve(count);
      });
  });
}

export interface ListLeadsOptions {
  tag?: string;
  company?: string;
  limit: number;
}

export async function listLeads(opts: ListLeadsOptions): Promise<Lead[]> {
  let rows;

  if (opts.tag && opts.company) {
    rows = await sql`
      SELECT * FROM leads
      WHERE tags LIKE ${"%" + opts.tag + "%"}
        AND company ILIKE ${"%" + opts.company + "%"}
      ORDER BY imported_at DESC
      LIMIT ${opts.limit}
    `;
  } else if (opts.tag) {
    rows = await sql`
      SELECT * FROM leads
      WHERE tags LIKE ${"%" + opts.tag + "%"}
      ORDER BY imported_at DESC
      LIMIT ${opts.limit}
    `;
  } else if (opts.company) {
    rows = await sql`
      SELECT * FROM leads
      WHERE company ILIKE ${"%" + opts.company + "%"}
      ORDER BY imported_at DESC
      LIMIT ${opts.limit}
    `;
  } else {
    rows = await sql`
      SELECT * FROM leads
      ORDER BY imported_at DESC
      LIMIT ${opts.limit}
    `;
  }

  return rows.map((r: any) => ({
    id: r.id,
    linkedinId: r.linkedin_id,
    name: r.name,
    headline: r.headline,
    company: r.company,
    title: r.title,
    location: r.location,
    profileUrl: r.profile_url,
    tags: r.tags,
    importedAt: r.imported_at,
    source: r.source,
  }));
}

export async function tagLead(
  linkedinId: string,
  tag: string
): Promise<void> {
  const rows = await sql`
    SELECT tags FROM leads WHERE linkedin_id = ${linkedinId}
  `;

  if (rows.length === 0) {
    throw new Error(`Lead not found: ${linkedinId}`);
  }

  const currentTags = rows[0].tags ? rows[0].tags.split(",") : [];
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
  }

  await sql`
    UPDATE leads SET tags = ${currentTags.join(",")}
    WHERE linkedin_id = ${linkedinId}
  `;
}
