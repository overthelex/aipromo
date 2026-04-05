import postgres from "postgres";
import { appConfig } from "../config.js";

function createSql() {
  const url = appConfig.databaseUrl;

  // Cloud SQL uses Unix sockets: detect ?host=/cloudsql/... pattern
  // Format: postgres://user:pass@/dbname?host=/cloudsql/project:region:instance
  const hostMatch = url.match(/\?host=(.+)$/);
  if (hostMatch) {
    const cleanUrl = url.replace(/\?host=.+$/, "");
    // postgres://user:pass@/dbname -> extract user, pass, dbname
    const match = cleanUrl.match(/postgres:\/\/([^:]+):([^@]+)@\/(.+)/);
    if (match) {
      return postgres({
        host: hostMatch[1],
        port: 5432,
        database: match[3],
        username: match[1],
        password: match[2],
        max: 5,
        idle_timeout: 20,
      });
    }
  }

  return postgres(url, { max: 10, idle_timeout: 20 });
}

export const sql = createSql();

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
      status TEXT NOT NULL DEFAULT 'prospect',
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
      attendee_name TEXT NOT NULL DEFAULT '',
      attendee_provider_id TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '',
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'new',
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER,
      message_id TEXT UNIQUE NOT NULL,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      is_sender BOOLEAN NOT NULL DEFAULT false,
      message_type TEXT NOT NULL DEFAULT '',
      timestamp TIMESTAMPTZ NOT NULL,
      seen BOOLEAN NOT NULL DEFAULT false
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT '',
      post_id TEXT NOT NULL,
      social_id TEXT NOT NULL DEFAULT '',
      author_id TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      is_company_post BOOLEAN NOT NULL DEFAULT false,
      written_by_id TEXT NOT NULL DEFAULT '',
      written_by_name TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      share_url TEXT NOT NULL DEFAULT '',
      comment_count INTEGER NOT NULL DEFAULT 0,
      reaction_count INTEGER NOT NULL DEFAULT 0,
      repost_count INTEGER NOT NULL DEFAULT 0,
      impressions_count INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      engagement_rate REAL NOT NULL DEFAULT 0,
      is_repost BOOLEAN NOT NULL DEFAULT false,
      posted_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, post_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS drafts (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER,
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

  // Migrations for posts columns
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_company_post BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS written_by_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS written_by_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS engagement_rate REAL NOT NULL DEFAULT 0`;

  // Migrations for conversations columns
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attendee_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attendee_provider_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;

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

  // Performance indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON conversations(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_outreach_queue_lead_id ON outreach_queue(lead_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_outreach_queue_campaign ON outreach_queue(campaign_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_account_id ON leads(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_account_id ON posts(account_id)`;

  // --- Lead pipeline status ---
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'prospect'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`;

  // --- Follow-up sequences ---
  await sql`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id),
      account_id TEXT NOT NULL DEFAULT '',
      campaign_id INTEGER,
      step INTEGER NOT NULL DEFAULT 1,
      scheduled_for TIMESTAMPTZ NOT NULL,
      message_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(status, scheduled_for)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_follow_ups_lead ON follow_ups(lead_id)`;

  // --- Lead notes ---
  await sql`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id),
      author TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // --- Deals ---
  await sql`
    CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id),
      account_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      value NUMERIC NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'UAH',
      stage TEXT NOT NULL DEFAULT 'qualification',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )
  `;

  // --- Outreach angle tracking ---
  await sql`ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS message_angle TEXT NOT NULL DEFAULT ''`;

  // --- Users ---
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function closeDatabase(): Promise<void> {
  await sql.end();
}
