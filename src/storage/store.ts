import postgres from "postgres";
import { appConfig } from "../config.js";

export const sql = postgres(appConfig.databaseUrl);

export async function initDatabase(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT '',
      linkedin_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      profile_url TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'connection',
      UNIQUE(account_id, linkedin_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT '',
      chat_id TEXT UNIQUE NOT NULL,
      lead_id INTEGER REFERENCES leads(id),
      last_message_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'new'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS drafts (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id),
      lead_id INTEGER REFERENCES leads(id),
      draft_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS outreach_campaigns (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      template TEXT NOT NULL DEFAULT '',
      target_tags TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS outreach_queue (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES outreach_campaigns(id),
      lead_id INTEGER REFERENCES leads(id),
      message_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_activity (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      action_type TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(account_id, date, action_type)
    )
  `;

  // Migrations for existing tables
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS account_id TEXT NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS account_id TEXT NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS account_id TEXT NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE daily_activity ADD COLUMN IF NOT EXISTS account_id TEXT NOT NULL DEFAULT ''
  `;

  // Drop old unique constraint on leads if exists, add new one
  await sql`
    ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_linkedin_id_key
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_account_linkedin_id_key ON leads(account_id, linkedin_id)
  `;

  // Drop old unique constraint on daily_activity if exists, add new one
  await sql`
    ALTER TABLE daily_activity DROP CONSTRAINT IF EXISTS daily_activity_date_action_type_key
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS daily_activity_account_date_action_key ON daily_activity(account_id, date, action_type)
  `;
}

export async function closeDatabase(): Promise<void> {
  await sql.end();
}
