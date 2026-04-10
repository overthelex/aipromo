/**
 * Campaign: Panoptic OSINT platform — cybersecurity & due diligence for Ukrainian businesses
 * Target: CISOs, security directors, compliance officers, risk managers, lawyers doing due diligence
 * Channels: LinkedIn + Instagram (Igor)
 */

import type { CampaignConfig } from "./types.js";

export const CAMPAIGN_NAME = "panoptic-osint";

export const PRODUCT_CONTEXT = `
## Продукт: panoptic.com.ua — OSINT & кіберрозвідка для бізнесу

### Що це
AI-платформа для бізнес-безпеки: перевірка контрагентів, моніторинг кіберзагроз, аналіз репутації та dark web.
Одна платформа замість десятків розрізнених інструментів.

### Ключові модулі

**1. Due Diligence & Sanctions Screening**
- 4M+ санкційних записів (OFAC, EU, UN, РНБО України)
- Корпоративні реєстри: GLEIF (2.5M LEI), ICIJ Offshore Leaks (810K офшорів), UK Companies House (5M+ компаній з бенефіціарами)
- Миттєва перевірка контрагента за секунди

**2. Dark Web & Breach Monitoring**
- 6 паралельних джерел: Dehashed (15B+ записів), HIBP, LeakCheck, pwndb через Tor, Intelligence X
- Моніторинг 100+ ransomware груп (16,000+ жертв)
- Алерти при появі корпоративних даних у витоках

**3. SOCMINT & Media Intelligence**
- GDELT: мільярди статей, 100+ мов, оновлення кожні 15 хвилин
- Аналіз тональності та виявлення координованих кампаній
- Раннє попередження про репутаційні кризи

**4. Кібербезпека & Domain Intel**
- Certificate Transparency: пошук субдоменів
- NVD + CISA KEV + EPSS: пріоритизація вразливостей
- GitHub: виявлення витоків коду
- Shadow IT discovery

### Переваги
- 12+ інтегрованих джерел в одній платформі
- Пасивна розвідка — повністю легально (відповідність законодавству України та ЄС)
- Real-time моніторинг з алертами
- Українська платформа, побудована для локального ринку
- Безкоштовна перевірка Dark Web credentials без реєстрації
- Безкоштовний початковий аудит безпеки

### Сайт
https://panoptic.com.ua
`;

export const DAILY_SEARCH_QUERIES = [
  { day: 1, keywords: "CISO кібербезпека", title: "CISO OR Chief Information Security Officer OR директор з безпеки" },
  { day: 2, keywords: "compliance officer Ukraine", title: "Compliance OR Risk OR AML" },
  { day: 3, keywords: "due diligence перевірка контрагентів", title: "lawyer OR counsel OR адвокат OR Head of Legal" },
  { day: 4, keywords: "information security Ukraine", title: "Head OR Director OR Manager OR Lead" },
  { day: 5, keywords: "фінансовий моніторинг AML KYC", title: "AML OR KYC OR compliance OR фінмоніторинг" },
  { day: 6, keywords: "IT security SOC analyst", title: "SOC OR security engineer OR analyst OR pentester" },
  { day: 7, keywords: "корпоративна безпека служба безпеки", title: "директор OR начальник OR head OR manager" },
  { day: 8, keywords: "cyber threat intelligence", title: "threat intelligence OR CTI OR security researcher" },
  { day: 9, keywords: "risk management Ukraine enterprise", title: "Risk OR CRO OR Chief Risk" },
  { day: 10, keywords: "data protection DPO GDPR", title: "DPO OR Data Protection OR Privacy" },
  { day: 11, keywords: "internal audit fraud investigation", title: "audit OR fraud OR investigator OR forensic" },
  { day: 12, keywords: "банківська безпека фінтех", title: "CISO OR security OR безпека OR fintech" },
  { day: 13, keywords: "M&A due diligence advisor", title: "M&A OR advisor OR consultant OR partner" },
  { day: 14, keywords: "government security cyber Ukraine", title: "cyber OR security OR CERT OR advisor" },
];

export const OPTIMAL_HOURS_UTC = [6, 7, 8, 10, 14, 15]; // Kyiv 9-11, 13, 17-18

export const MESSAGE_ANGLES = [
  "dark_web_breach",    // Ваші корпоративні дані можуть вже бути в dark web
  "due_diligence_speed", // Перевірка контрагента за секунди замість днів
  "sanctions_check",     // 4M+ санкційних записів — OFAC, EU, UN, РНБО
  "competitor_intel",    // Моніторинг конкурентів та ринкових загроз
  "free_audit",         // Безкоштовний аудит безпеки та dark web scan
  "ransomware_alert",   // 100+ ransomware груп під моніторингом
  "reputation_risk",    // Раннє попередження про репутаційні кризи
];

export function getMessageAngle(dayNumber: number, leadIndex: number): string {
  return MESSAGE_ANGLES[(dayNumber + leadIndex) % MESSAGE_ANGLES.length];
}

export function getAngleInstruction(angle: string): string {
  switch (angle) {
    case "dark_web_breach":
      return "Focus on dark web monitoring: corporate credentials may already be leaked. Dehashed has 15B+ records. Offer a free check.";
    case "due_diligence_speed":
      return "Focus on speed: checking a counterparty across sanctions, offshore leaks, and company registries takes seconds, not days. One platform instead of many.";
    case "sanctions_check":
      return "Focus on sanctions compliance: 4M+ records from OFAC, EU, UN, and Ukraine's NSDC. Critical for any business doing international trade.";
    case "competitor_intel":
      return "Focus on competitive intelligence: GDELT monitors billions of articles in real-time. Detect coordinated campaigns and market shifts early.";
    case "free_audit":
      return "Lead with the free offer: complimentary security audit and dark web credential check, no registration required.";
    case "ransomware_alert":
      return "Focus on ransomware threat: monitoring 100+ ransomware groups tracking 16,000+ victims. Early warning if your industry or partners are targeted.";
    case "reputation_risk":
      return "Focus on reputation monitoring: GDELT-based sentiment analysis across 100+ languages, updated every 15 minutes. Catch crises before they escalate.";
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
  channels: ["linkedin", "instagram"],
  instagramAccountId: "TteLUPSvTi-cF1kEic4t_w",
};
