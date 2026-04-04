# aipromo

CLI tool for automating LinkedIn lead communication using AI. Reads incoming messages, generates personalized responses with Claude (via AWS Bedrock), and sends them through [Unipile API](https://www.unipile.com/).

## What it does

- **Inbox** — fetch and display unanswered LinkedIn conversations
- **Respond** — generate AI replies per conversation, review (approve / edit / skip), then send
- **Leads** — sync LinkedIn connections, import from CSV, filter and tag
- **Outreach** — run personalized mass-messaging campaigns with built-in templates
- **Rate limiting** — daily caps, human-like delays with jitter, business-hours enforcement

All AI-generated messages require manual approval before sending. Nothing is sent automatically.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  CLI (commander)  │────▶│  Unipile API │────▶│   LinkedIn   │
│             │     │  (messaging)  │     │              │
│  approve /  │     └──────────────┘     └──────────────┘
│  edit /     │
│  reject     │     ┌──────────────┐
│             │────▶│ AWS Bedrock  │  Claude Sonnet 4
└─────────────┘     │ (AI replies) │
       │            └──────────────┘
       ▼
┌──────────────┐
│  PostgreSQL  │  leads, conversations, drafts, campaigns
└──────────────┘
```

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- [Unipile](https://www.unipile.com/) account with LinkedIn connected
- AWS account with Bedrock access (Claude models enabled in your region)

## Setup

```bash
# Clone
git clone https://github.com/overthelex/aipromo.git
cd aipromo

# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d

# Configure
cp .env.example .env
# Edit .env with your API keys (see Configuration below)

# Initialize database
npx tsx scripts/init-db.ts

# Verify everything works
npx tsx src/index.ts config test
```

## Configuration

Edit `.env`:

```env
# PostgreSQL
DATABASE_URL=postgres://aipromo:aipromo_secret@localhost:5433/aipromo

# Unipile — get from https://www.unipile.com/ dashboard
UNIPILE_DSN=api1.unipile.com:13111
UNIPILE_ACCESS_TOKEN=your_token
UNIPILE_ACCOUNT_ID=your_account_id

# AWS Bedrock
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=eu-central-1
BEDROCK_MODEL=eu.anthropic.claude-sonnet-4-6

# Rate limits
MAX_MESSAGES_PER_DAY=50
MAX_INVITATIONS_PER_DAY=20
MIN_DELAY_SECONDS=3
MAX_DELAY_SECONDS=8
BUSINESS_HOURS_START=9
BUSINESS_HOURS_END=18

# Persona — used in AI system prompt
SENDER_NAME=Your Name
SENDER_COMPANY=Your Company
SENDER_ROLE=Your Title
CAMPAIGN_OBJECTIVE=Book a discovery call
```

## Usage

### Check inbox

```bash
npx tsx src/index.ts inbox
npx tsx src/index.ts inbox --unread-only --limit 10
```

### Respond to leads

```bash
# Preview AI drafts without sending
npx tsx src/index.ts respond --dry-run

# Interactive mode: review each AI draft → approve / edit / skip
npx tsx src/index.ts respond
```

### Manage leads

```bash
# Sync connections from LinkedIn
npx tsx src/index.ts leads sync

# Import from CSV (columns: linkedin_id, name, company, title, headline, location)
npx tsx src/index.ts leads import leads.csv

# List and filter
npx tsx src/index.ts leads list --company "Acme" --limit 20

# Tag leads for campaigns
npx tsx src/index.ts leads tag <linkedin_id> hot-lead
```

### Outreach campaigns

```bash
# Preview campaign (dry run)
npx tsx src/index.ts outreach start --template intro-short --tag hot-lead --dry-run

# Start campaign with confirmation
npx tsx src/index.ts outreach start --template intro-short --tag hot-lead --limit 25

# Manage campaigns
npx tsx src/index.ts outreach list
npx tsx src/index.ts outreach status <campaign_id>
npx tsx src/index.ts outreach pause <campaign_id>
```

**Built-in templates:** `intro-short`, `mutual-value`, `direct-ask`

### Configuration check

```bash
npx tsx src/index.ts config test   # verify API connections
npx tsx src/index.ts config show   # display current settings
```

## Project structure

```
src/
├── index.ts                     # Entry point
├── config.ts                    # Environment config with Zod validation
├── services/
│   ├── unipile.service.ts       # Unipile REST API client
│   ├── claude.service.ts        # Claude AI via AWS Bedrock
│   └── scheduler.service.ts     # Rate-limited task queue
├── core/
│   ├── inbox.ts                 # Fetch unanswered conversations
│   ├── responder.ts             # AI draft → approve → send flow
│   ├── leads.ts                 # Sync, CSV import, tagging
│   └── outreach.ts              # Mass campaign orchestration
├── cli/commands/                # CLI command handlers
├── templates/
│   ├── system-prompt.ts         # AI persona prompt
│   └── outreach-templates.ts    # Message templates
├── storage/store.ts             # PostgreSQL schema & connection
├── types/                       # TypeScript type definitions
└── utils/
    ├── rate-limiter.ts          # Daily caps, jitter, business hours
    ├── retry.ts                 # Exponential backoff
    └── logger.ts                # Structured logging (pino)
```

## Safety

- AI messages are **never auto-sent** — approve/edit/reject each one
- Rate limits enforced at service level (not bypassable from CLI)
- Daily caps: 50 messages, 20 invitations (configurable)
- Random 3-8s delay between API calls to mimic human behavior
- Business hours enforcement (9:00-18:00 by default)
- Credentials stored in `.env` (gitignored)

## License

ISC
