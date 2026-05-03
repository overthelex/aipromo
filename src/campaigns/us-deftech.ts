/**
 * Campaign: US DefTech — defense technology leaders outreach
 * Target: Directors, VPs, C-suite at Palantir, Anduril, Shield AI, L3Harris, etc.
 * Pitch: SecondLayer (LEX + Panoptic) — AI platform for defense intelligence & compliance
 */

import type { CampaignConfig } from "./types.js";

export const CAMPAIGN_NAME = "us-deftech";

export const PRODUCT_CONTEXT = `
## Company: SecondLayer — AI Intelligence & Compliance Platform

### What we build
Two AI platforms purpose-built for intelligence, compliance, and legal analytics:

**Panoptic (panoptic.com.ua)** — AI due diligence & OSINT
- Sanctions screening: 4M+ records (OFAC, EU, UN, Ukraine NSDC)
- Dark Web & breach monitoring: 15B+ records across 6 parallel sources
- Corporate registry checks: GLEIF, ICIJ Offshore Leaks, UK Companies House
- Ransomware group tracking: 100+ groups, 16K+ victims monitored
- GDELT media intelligence: billions of articles, real-time sentiment
- One platform instead of 10+ databases

**LEX (legal.org.ua)** — AI legal analytics
- 120M+ court records indexed with AI
- Instant registry access via natural language
- Live in Ukraine/CEE, expanding globally

### Why Defense Tech Leaders Care
- Intelligence-grade OSINT automation (relevant for due diligence, threat intel, compliance)
- Built for adversarial environments (Ukraine conflict zone, sanctions enforcement)
- Real-time monitoring of dark web, ransomware, and media signals
- Proven in a live conflict environment — battle-tested AI
- Language-agnostic AI stack ready for multi-domain deployment

### Traction
- 118 AI tools deployed across both platforms
- $0.02 avg query cost, 60% gross margins
- Live production systems with real users
- Built and maintained by a lean 2-person team

### Links
- Panoptic: https://panoptic.com.ua
- LEX: https://opendata.legal.org.ua
- Deck: https://legal.org.ua/pitch-deck.html
`;

export const DAILY_SEARCH_QUERIES = [
  { day: 1, keywords: "Palantir", title: "VP OR Director OR Head OR CEO OR CTO OR Chief" },
  { day: 2, keywords: "Anduril Industries", title: "VP OR Director OR Head OR CEO OR CTO OR Chief OR Founder" },
  { day: 3, keywords: "Shield AI", title: "VP OR Director OR Head OR CEO OR CTO OR Chief OR Founder" },
  { day: 4, keywords: "L3Harris Technologies", title: "VP OR Director OR Head OR Chief OR SVP" },
  { day: 5, keywords: "Northrop Grumman", title: "VP OR Director OR Head OR Chief OR SVP" },
  { day: 6, keywords: "Lockheed Martin", title: "VP OR Director OR Chief OR SVP" },
  { day: 7, keywords: "Raytheon RTX", title: "VP OR Director OR Head OR Chief OR SVP" },
  { day: 8, keywords: "General Dynamics", title: "VP OR Director OR Head OR Chief" },
  { day: 9, keywords: "Leidos defense intelligence", title: "VP OR Director OR Head OR Chief OR SVP" },
  { day: 10, keywords: "Scale AI defense federal", title: "VP OR Director OR Head OR CEO OR CTO" },
  { day: 11, keywords: "Skydio autonomous drone", title: "VP OR Director OR Head OR CEO OR CTO OR Founder" },
  { day: 12, keywords: "Saronic Technologies", title: "VP OR Director OR Founder OR CEO OR CTO OR Head" },
  { day: 13, keywords: "HawkEye 360 satellite", title: "VP OR Director OR CEO OR CTO OR Head" },
  { day: 14, keywords: "defense technology startup AI", title: "CEO OR Founder OR CTO OR VP OR Director" },
];

// US East optimal hours (UTC): 9-11am, 1pm, 5-6pm ET = UTC-4
export const OPTIMAL_HOURS_UTC = [13, 14, 15, 17, 21, 22];

export const MESSAGE_ANGLES = [
  "osint-platform",
  "sanctions-compliance",
  "dark-web-intel",
  "battle-tested",
  "demo-hook",
  "partnership",
  "intelligence-automation",
];

export function getMessageAngle(dayNumber: number, leadIndex: number): string {
  return MESSAGE_ANGLES[(dayNumber + leadIndex) % MESSAGE_ANGLES.length];
}

export function getAngleInstruction(angle: string): string {
  switch (angle) {
    case "osint-platform":
      return "Lead with the OSINT platform: one unified system for sanctions, dark web, corporate registries, and media intelligence. Mention Panoptic covers what typically requires 10+ tools.";
    case "sanctions-compliance":
      return "Focus on sanctions screening: 4M+ records from OFAC, EU, UN. Instant counterparty checks. Critical for defense contractors and government-adjacent companies.";
    case "dark-web-intel":
      return "Focus on dark web & breach monitoring: 15B+ records, ransomware group tracking. Ask if they monitor their supply chain's exposure in dark web leaks.";
    case "battle-tested":
      return "Focus on the unique angle: this AI was built and proven in an active conflict zone (Ukraine). Battle-tested intelligence tools, not peacetime prototypes.";
    case "demo-hook":
      return "Lead with the live demo: panoptic.com.ua — let the platform speak for itself. Offer to run a free dark web scan on their domain or a sanctions check on a counterparty.";
    case "partnership":
      return "Frame as partnership opportunity: we're expanding to US defense/intel market. Looking for strategic partners who understand the DoD/IC ecosystem. Light ask — just a conversation.";
    case "intelligence-automation":
      return "Focus on AI-powered intelligence automation: 118 tools deployed, $0.02/query, real-time monitoring. Ask about their current OSINT/compliance workflow and pain points.";
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
