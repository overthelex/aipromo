import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { initDatabase, closeDatabase, sql } from "../src/storage/store.js";
import { createReadStream } from "fs";
import { parse } from "csv-parse";

const accountId = "hYhcYj2_R2Kp7AQCtvQYZg"; // ihor

async function main() {
  await initDatabase();

  const records: any[] = [];
  await new Promise<void>((resolve, reject) => {
    createReadStream("scripts/defense-tech-leaders.csv")
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (row: any) => records.push(row))
      .on("error", reject)
      .on("end", resolve);
  });

  let count = 0;
  for (const row of records) {
    const linkedinId = row.linkedin_id;
    if (!linkedinId) continue;

    await sql`
      INSERT INTO leads (account_id, linkedin_id, name, headline, location, profile_url, tags, source)
      VALUES (
        ${accountId},
        ${linkedinId},
        ${row.name || ""},
        ${row.headline || ""},
        ${row.location || ""},
        ${row.profile_url || ""},
        ${"us-deftech"},
        ${"search"}
      )
      ON CONFLICT (account_id, linkedin_id)
      DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
        headline = COALESCE(NULLIF(EXCLUDED.headline, ''), leads.headline),
        location = COALESCE(NULLIF(EXCLUDED.location, ''), leads.location),
        tags = CASE
          WHEN leads.tags = '' THEN 'us-deftech'
          WHEN leads.tags LIKE '%us-deftech%' THEN leads.tags
          ELSE leads.tags || ',us-deftech'
        END
    `;
    count++;
  }

  console.log(`Imported ${count} leads with tag "us-deftech"`);
  await closeDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
