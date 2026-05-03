/**
 * Generate hyper-personalized LinkedIn invite messages (max 300 chars)
 * for each of the 50 US DefTech leads.
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { ClaudeService } from "../src/services/claude.service.js";
import { createReadStream } from "fs";
import { writeFileSync } from "fs";
import { parse } from "csv-parse";

interface Lead {
  linkedin_id: string;
  name: string;
  headline: string;
  location: string;
  profile_url: string;
}

const SYSTEM_PROMPT = `You are a copywriter for legal.org.ua — a Ukrainian AI legaltech startup.

ABOUT THE COMPANY:
- legal.org.ua provides AI-powered contract auditing, company/individual due diligence, and beneficiary identification for Ukrainian and international companies
- Full corpus of Ukrainian court decisions (EDRS — 120M+ records)
- All available Ukrainian government registries (property, companies, debtors, beneficiaries)
- ML models (DeepSeek v3) for document analysis and entity extraction
- Backed by AWS for Startups and Google for Startups (GCP)
- Relevant for anyone doing business in Ukraine, Eastern Europe, or needing counterparty checks in the region

YOUR TASK:
Write a LinkedIn connection invite message. STRICT RULES:
1. MAXIMUM 300 characters (this is a hard LinkedIn limit — message will be cut if longer)
2. Personalize based on the person's role, company, and headline
3. Find a natural hook connecting THEIR work to what legal.org.ua offers
4. Be direct, professional, no fluff, no emojis
5. Don't start with "Hi [Name]" — just the substance (name is shown separately on LinkedIn)
6. Write in English
7. End with a soft CTA (connect, explore, chat — not "schedule a demo")
8. DO NOT use quotation marks around the message
9. Make it sound human, not templated

ANGLE IDEAS (pick the most relevant for each person):
- Defense contractors need due diligence on Ukrainian/Eastern European subcontractors and partners
- Compliance teams need sanctions + beneficiary checks for cross-border deals
- AI/ML leaders may appreciate the technical approach (DeepSeek v3, 120M court records)
- C-suite at companies expanding into Eastern Europe need legal intelligence
- Defense tech + Ukraine connection: supporting allies through business intelligence
- Anyone doing OSINT/intelligence: our data sources and AI analytics are complementary

Output ONLY the invite text. No labels, no quotes, nothing else.`;

async function main() {
  const claude = new ClaudeService();

  // Read leads CSV
  const leads: Lead[] = [];
  await new Promise<void>((resolve, reject) => {
    createReadStream("scripts/defense-tech-leaders.csv")
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (row: any) => leads.push(row))
      .on("error", reject)
      .on("end", resolve);
  });

  console.log(`Generating invites for ${leads.length} leads...\n`);

  const results: Array<{ name: string; headline: string; linkedin_id: string; profile_url: string; invite: string }> = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    console.log(`[${i + 1}/${leads.length}] ${lead.name} — ${lead.headline.slice(0, 60)}...`);

    const userPrompt = `Generate a LinkedIn invite message (max 300 chars) for:
Name: ${lead.name}
Headline: ${lead.headline}
Location: ${lead.location}`;

    let invite = "";
    try {
      invite = await claude.generateWithSystem(SYSTEM_PROMPT, userPrompt);
      // Strip quotes if AI added them
      invite = invite.replace(/^["']|["']$/g, "").trim();

      // Verify length
      if (invite.length > 300) {
        console.log(`  ⚠ Too long (${invite.length}), regenerating...`);
        const retryPrompt = `${userPrompt}\n\nIMPORTANT: Your previous response was ${invite.length} chars which exceeds the 300 char limit. Write a SHORTER version. Count carefully. Max 300 characters total.`;
        invite = await claude.generateWithSystem(SYSTEM_PROMPT, retryPrompt);
        invite = invite.replace(/^["']|["']$/g, "").trim();
      }

      if (invite.length > 300) {
        invite = invite.slice(0, 297) + "...";
      }

      console.log(`  ✓ (${invite.length} chars): ${invite.slice(0, 80)}...`);
    } catch (err: any) {
      console.error(`  ✗ Error: ${err.message}`);
      invite = "Your work in defense tech is impressive. We built an AI platform for legal due diligence and beneficiary checks across Ukraine/E.Europe — 120M court records, all registries. Could be relevant for your compliance needs. Open to connecting?";
    }

    results.push({
      name: lead.name,
      headline: lead.headline,
      linkedin_id: lead.linkedin_id,
      profile_url: lead.profile_url,
      invite,
    });
  }

  // Save results as CSV
  const csvHeader = "linkedin_id,name,headline,profile_url,invite_text,char_count";
  const csvRows = results.map((r) =>
    [
      r.linkedin_id,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.headline.replace(/"/g, '""')}"`,
      `"${r.profile_url}"`,
      `"${r.invite.replace(/"/g, '""')}"`,
      r.invite.length,
    ].join(",")
  );

  const csv = [csvHeader, ...csvRows].join("\n");
  writeFileSync("scripts/deftech-invites.csv", csv);

  // Also save as readable text
  const txt = results
    .map((r, i) => `--- ${i + 1}. ${r.name} (${r.invite.length} chars) ---\n${r.headline}\n\n${r.invite}\n`)
    .join("\n");
  writeFileSync("scripts/deftech-invites.txt", txt);

  console.log(`\n=== Done! ===`);
  console.log(`CSV: scripts/deftech-invites.csv`);
  console.log(`TXT: scripts/deftech-invites.txt`);

  // Stats
  const lengths = results.map((r) => r.invite.length);
  console.log(`\nAvg length: ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)} chars`);
  console.log(`Max: ${Math.max(...lengths)}, Min: ${Math.min(...lengths)}`);
  const over300 = lengths.filter((l) => l > 300).length;
  if (over300 > 0) console.log(`⚠ ${over300} messages over 300 chars!`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
