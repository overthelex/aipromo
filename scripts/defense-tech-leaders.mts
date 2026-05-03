/**
 * Find 50 defense tech leaders from the US via Unipile LinkedIn search.
 * Uses keyword + title search (company IDs don't work reliably in Unipile).
 * Filters: Director+, US location, real profiles (not "LinkedIn Member").
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { UnipileService } from "../src/services/unipile.service.js";
import { writeFileSync } from "fs";

interface LeadResult {
  id: string;
  name: string;
  headline: string;
  location: string;
  profileUrl: string;
  networkDistance: string;
}

const SEARCHES = [
  { keywords: "Palantir", title: "VP OR Director OR Head OR CEO OR CTO OR Chief" },
  { keywords: "Anduril Industries", title: "VP OR Director OR Head OR CEO OR CTO OR Chief OR Founder" },
  { keywords: "Shield AI", title: "VP OR Director OR Head OR CEO OR CTO OR Chief OR Founder" },
  { keywords: "L3Harris Technologies", title: "VP OR Director OR Head OR Chief OR SVP" },
  { keywords: "Northrop Grumman", title: "VP OR Director OR Head OR Chief OR SVP" },
  { keywords: "Lockheed Martin", title: "VP OR Director OR Chief OR SVP" },
  { keywords: "Raytheon RTX", title: "VP OR Director OR Head OR Chief OR SVP" },
  { keywords: "General Dynamics", title: "VP OR Director OR Head OR Chief" },
  { keywords: "Leidos", title: "VP OR Director OR Head OR Chief OR SVP" },
  { keywords: "Booz Allen Hamilton", title: "VP OR Director OR Head OR Chief OR SVP" },
  { keywords: "Scale AI", title: "VP OR Director OR Head OR CEO OR CTO" },
  { keywords: "Skydio", title: "VP OR Director OR Head OR CEO OR CTO OR Founder" },
  { keywords: "Saronic Technologies", title: "VP OR Director OR Founder OR CEO OR CTO OR Head" },
  { keywords: "HawkEye 360", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Hadrian Manufacturing defense", title: "VP OR Director OR CEO OR CTO OR Founder" },
  { keywords: "Rebellion Defense", title: "VP OR Director OR Founder OR CEO OR CTO" },
  { keywords: "Primer AI intelligence", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Dedrone defense drone", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Epirus defense directed energy", title: "VP OR Director OR CEO OR CTO OR Founder" },
  { keywords: "Hermeus hypersonic", title: "VP OR Director OR CEO OR CTO OR Founder" },
  { keywords: "Palantir Technologies defense government", title: "VP OR Director OR Head OR Chief OR SVP OR General Manager" },
  { keywords: "Anduril defense autonomous systems", title: "VP OR Director OR Head OR Chief OR General Manager" },
  { keywords: "defense technology startup CEO founder", title: "CEO OR Founder OR CTO OR President" },
  { keywords: "CACI International defense", title: "VP OR Director OR Head OR Chief OR SVP" },
  { keywords: "Babel Street intelligence", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Recorded Future intelligence", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Two Six Technologies", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Fortinet defense federal", title: "VP OR Director OR Chief OR Head" },
  { keywords: "SAIC defense intelligence", title: "VP OR Director OR Chief OR SVP OR Head" },
  { keywords: "Kratos defense security", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "AeroVironment defense", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Mercury Systems defense", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "Maxar Technologies satellite defense", title: "VP OR Director OR CEO OR CTO OR Head" },
  { keywords: "defense tech venture capital", title: "Partner OR Managing Director OR GP OR Founder" },
  { keywords: "DoD technology innovation", title: "Director OR VP OR Head OR Chief OR CTO" },
  { keywords: "Pentagon DIU defense innovation", title: "Director OR VP OR Head OR Chief" },
];

// LinkedIn geo ID for United States (101452733 is actually Australia!)
const US_LOCATION_ID = "103644278";

// Seniority: 5=Director, 6=VP, 7=CXO, 8=Partner, 9=Owner
const SENIORITY = ["5", "6", "7", "8", "9"];

function isRealProfile(item: any): boolean {
  const name = item.name || "";
  if (name === "LinkedIn Member" || name.trim() === "") return false;
  if (!item.headline || item.headline.trim() === "") return false;
  if (!item.public_profile_url && !item.profile_url) return false;
  return true;
}

function isDefenseTechRelated(headline: string): boolean {
  const lower = headline.toLowerCase();
  const companies = [
    "palantir", "anduril", "shield ai", "l3harris", "l3 harris",
    "northrop", "lockheed", "raytheon", "rtx", "general dynamics", "leidos",
    "booz allen", "scale ai", "rebellion", "skydio", "saronic",
    "hawkeye", "defense", "defence", "military", "dod", "national security",
    "aerospace", "missile", "radar", "satellite", "naval",
    "pentagon", "drone", "unmanned", "cybersecurity",
    "clearance", "federal", "govcon",
    "hadrian", "primer", "dedrone", "epirus", "hermeus",
  ];
  return companies.some((kw) => lower.includes(kw));
}

function isSeniorLeader(headline: string): boolean {
  const lower = headline.toLowerCase();
  const seniorTitles = [
    "ceo", "cto", "coo", "cfo", "ciso", "cpo", "cro",
    "chief", "founder", "co-founder", "cofounder",
    "president", "vice president", "vp ", "svp ", "evp ",
    "director", "head of", "general manager",
    "partner", "managing director", "board",
  ];
  const excludeTitles = [
    "recruiter", "recruiting", "talent acquisition", "talent @",
    "hiring", "staffing",
    "software engineer", "swe ", "sde ", "senior engineer",
    "data engineer", "ml engineer", "machine learning engineer",
    "incoming", "intern", "student", "analyst",
    "warehouse", "coordinator", "specialist",
    "human resources", "hr business partner", "hr leader",
    "hrir", "chrl",
    "defi", "crypto", "blockchain", "matchmaking",
  ];
  const hasSenior = seniorTitles.some((t) => lower.includes(t));
  const hasExclude = excludeTitles.some((t) => lower.includes(t));
  return hasSenior && !hasExclude;
}

function isUSLocation(location: string): boolean {
  const lower = location.toLowerCase();
  // Exclude Australian locations first
  if (lower.includes("australia") || lower.includes(", nsw") || lower.includes(", vic") ||
      lower.includes(", qld") || lower.includes("sydney") || lower.includes("melbourne") ||
      lower.includes("brisbane") || lower.includes("perth,") || lower.includes("adelaide") ||
      lower.includes("canberra") || lower.includes("hobart") || lower.includes("gold coast") ||
      lower.includes("fremantle") || lower.includes("wollongong")) {
    return false;
  }
  const usIndicators = [
    "united states", "usa",
    // Full state names
    "california", "new york", "texas", "virginia", "maryland",
    "colorado", "florida", "massachusetts", "washington",
    "arizona", "ohio", "pennsylvania", "illinois", "north carolina",
    "district of columbia", "d.c.",
    // US Cities
    "san francisco", "los angeles", "new york city", "nyc",
    "seattle", "boston", "austin", "denver",
    "san diego", "san jose", "palo alto", "mountain view",
    "arlington, va", "mclean", "reston", "herndon",
    // Common metro patterns
    "bay area", "silicon valley",
    "greater los angeles", "greater new york", "greater boston",
    "greater seattle", "greater washington", "greater denver",
    "greater austin", "greater san diego", "greater chicago",
    "greater atlanta", "greater houston", "greater dallas",
    "greater phoenix", "greater detroit", "greater minneapolis",
    "greater nashville", "greater orlando", "greater charlotte",
    "greater pittsburgh", "greater salt lake",
  ];
  return usIndicators.some((ind) => lower.includes(ind));
}

async function main() {
  console.log("=== Defense Tech Leaders Search (US) ===\n");

  const accounts = ["ihor"];
  const allLeads: LeadResult[] = [];
  const seenIds = new Set<string>();
  const target = 900; // collect many, then filter to 50 US senior leaders

  for (const alias of accounts) {
    if (allLeads.length >= target) break;
    const unipile = new UnipileService(alias);
    console.log(`\n--- Account: ${alias} ---\n`);

    for (const query of SEARCHES) {
      if (allLeads.length >= target) break;

      console.log(`  "${query.keywords}" | ${query.title.slice(0, 40)}...`);

      let cursor: string | undefined;
      let pages = 0;

      while (allLeads.length < target && pages < 5) {
        const body: Record<string, unknown> = {
          api: "classic",
          category: "people",
          keywords: query.keywords,
          title: query.title,
          location: [US_LOCATION_ID],
          seniority: SENIORITY,
          limit: 25,
        };
        if (cursor) body.cursor = cursor;

        try {
          const data = await unipile.searchPeople(body);
          if (!data.items || data.items.length === 0) break;

          for (const item of data.items) {
            if (allLeads.length >= target) break;
            if (seenIds.has(item.id)) continue;
            if (!isRealProfile(item)) continue;

            seenIds.add(item.id);
            allLeads.push({
              id: item.id,
              name: item.name,
              headline: item.headline ?? "",
              location: item.location ?? "",
              profileUrl: item.public_profile_url ?? item.profile_url ?? "",
              networkDistance: item.network_distance ?? "",
            });
          }

          cursor = data.cursor;
          if (!cursor) break;
          pages++;
        } catch (err: any) {
          console.error(`    Error: ${err.message}`);
          break;
        }
      }

      console.log(`    → ${allLeads.length} total`);
    }
  }

  console.log(`\nCollected ${allLeads.length} leads. Filtering...\n`);

  // Step 1: Filter for US location
  const usLeads = allLeads.filter((l) => isUSLocation(l.location));
  console.log(`  US-based: ${usLeads.length}/${allLeads.length}`);

  // Step 2: Filter for senior leaders (Director+)
  const seniorLeads = usLeads.filter((l) => isSeniorLeader(l.headline));
  console.log(`  Senior leaders (Director+): ${seniorLeads.length}`);

  // Step 3: Filter for defense-tech relevance
  const defenseLeads = seniorLeads.filter((l) => isDefenseTechRelated(l.headline));
  console.log(`  Defense-tech relevant: ${defenseLeads.length}`);

  // Take top 50. If not enough strict matches, add senior US leads
  const final = defenseLeads.slice(0, 50);
  if (final.length < 50) {
    const remaining = seniorLeads.filter((l) => !defenseLeads.includes(l));
    for (const l of remaining) {
      if (final.length >= 50) break;
      final.push(l);
    }
  }
  console.log(`  Final list: ${final.length}\n`);

  // Save CSV
  const csvHeader = "linkedin_id,name,headline,location,profile_url,network_distance";
  const csvRows = final.map((l) =>
    [
      l.id,
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.headline.replace(/"/g, '""')}"`,
      `"${l.location.replace(/"/g, '""')}"`,
      `"${l.profileUrl}"`,
      l.networkDistance,
    ].join(",")
  );

  const csv = [csvHeader, ...csvRows].join("\n");
  writeFileSync("scripts/defense-tech-leaders.csv", csv);
  console.log(`Saved ${final.length} leads → scripts/defense-tech-leaders.csv\n`);

  // Print table
  console.log("| # | Name | Headline | Location |");
  console.log("|---|------|----------|----------|");
  final.forEach((l, i) => {
    const h = l.headline.length > 60 ? l.headline.slice(0, 57) + "..." : l.headline;
    console.log(`| ${i + 1} | ${l.name} | ${h} | ${l.location} |`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
