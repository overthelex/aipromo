/**
 * Campaign: Investor outreach — United States
 * Target: investors, VCs, angels, legaltech enthusiasts in the US
 * Pitch: Invest in SecondLayer (LEX + Panoptic) — AI LegalTech/OSINT startup
 */

import type { CampaignConfig } from "./types.js";

export const CAMPAIGN_NAME = "investor-us";

export const PRODUCT_CONTEXT = `
## Company: SecondLayer — AI LegalTech & OSINT

### What we build
Two live AI platforms with zero direct competitors:

**LEX (legal.org.ua / opendata.legal.org.ua)** — AI legal analytics
- 120M+ court records indexed with AI
- Instant registry access (property, companies, debtors) via natural language chat
- Live in Ukraine/CEE, expanding to EU and US

**Panoptic (panoptic.com.ua)** — AI due diligence & OSINT
- Sanctions screening (4M+ records: OFAC, EU, UN)
- Dark Web & breach monitoring (15B+ records)
- Corporate registry checks (GLEIF, ICIJ Offshore Leaks, UK Companies House)
- One platform instead of 10+ databases

### Traction & Unit Economics
- 118 AI tools deployed across both platforms
- $0.02 avg query cost, 60% gross margins
- 5.9x LTV/CAC ratio
- $1.2B+ TAM (legal analytics + due diligence)

### Investment
- Pre-money: $1M
- Raising: $50K for 5%
- Deck: legal.org.ua/pitch-deck.html
- Live demo: opendata.legal.org.ua
`;

export const DAILY_SEARCH_QUERIES = [
  { day: 1, keywords: "investor legaltech AI", title: "investor OR partner OR venture" },
  { day: 2, keywords: "angel investor legal technology", title: "angel OR founder OR investor" },
  { day: 3, keywords: "venture capital artificial intelligence", title: "partner OR principal OR associate" },
  { day: 4, keywords: "startup investor early stage seed", title: "investor OR venture OR angel" },
  { day: 5, keywords: "legaltech innovation", title: "founder OR CEO OR investor OR managing" },
  { day: 6, keywords: "AI startup funding seed", title: "investor OR VC OR partner OR GP" },
  { day: 7, keywords: "private equity technology SaaS", title: "partner OR managing director OR principal" },
  { day: 8, keywords: "regtech compliance investor", title: "investor OR partner OR board member" },
  { day: 9, keywords: "SaaS investor B2B enterprise", title: "investor OR venture OR general partner" },
  { day: 10, keywords: "legal innovation technology law", title: "investor OR founder OR advisor" },
  { day: 11, keywords: "cybersecurity OSINT intelligence investor", title: "investor OR partner OR advisor" },
  { day: 12, keywords: "seed pre-seed investor deeptech", title: "investor OR founder OR partner OR GP" },
  { day: 13, keywords: "impact investor technology", title: "investor OR partner OR director" },
  { day: 14, keywords: "fintech investor data analytics", title: "investor OR angel OR VC OR partner" },
];

// Optimal hours for US East (UTC-4 summer) — 9-11am, 1pm, 5-6pm ET
export const OPTIMAL_HOURS_UTC = [13, 14, 15, 17, 21, 22];

export const MESSAGE_ANGLES = [
  "investor-pitch",
  "traction-proof",
  "market-gap",
  "us-expansion",
  "unit-economics",
  "demo-hook",
  "question-hook",
];

export function getMessageAngle(dayNumber: number, leadIndex: number): string {
  return MESSAGE_ANGLES[(dayNumber + leadIndex) % MESSAGE_ANGLES.length];
}

export function getAngleInstruction(angle: string): string {
  switch (angle) {
    case "investor-pitch":
      return "Core investment pitch: $1M pre-money, raising $50K for 5%. Two live AI platforms, zero direct competitors. Include deck link and opendata.legal.org.ua demo.";
    case "traction-proof":
      return "Focus on traction: 118 AI tools deployed, 2 live platforms with real users, built and shipped by a lean team. This is not a slide deck — it's live product.";
    case "market-gap":
      return "Focus on the gap: no one combines legal analytics + due diligence/OSINT in one AI stack. Competitors do one or the other, never both.";
    case "us-expansion":
      return "Focus on US market potential: live in Ukraine/CEE with proven unit economics, the AI stack is language-agnostic and ready for US legal market — the largest in the world.";
    case "unit-economics":
      return "Lead with unit economics: $0.02 avg query cost, 60% gross margins, 5.9x LTV/CAC. Efficient AI infrastructure built from day one.";
    case "demo-hook":
      return "Lead with the live demo: opendata.legal.org.ua — let the product speak for itself. Ask them to try it and share their take.";
    case "question-hook":
      return "Start with a question about legal AI adoption or due diligence automation in the US market. Then bridge to SecondLayer as a solution.";
    default:
      return "";
  }
}

export const config: CampaignConfig = {
  name: CAMPAIGN_NAME,
  productContext: PRODUCT_CONTEXT,
  dailySearchQueries: DAILY_SEARCH_QUERIES,
  optimalHoursUtc: OPTIMAL_HOURS_UTC,
  messageAngles: MESSAGE_ANGLES,
  getMessageAngle,
  getAngleInstruction,
  channels: ["linkedin"],
};
