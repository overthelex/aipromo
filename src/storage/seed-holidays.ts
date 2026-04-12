/**
 * Seed public holidays for Ukraine + all 27 EU countries for 2026.
 * Run: npx tsx src/storage/seed-holidays.ts
 *
 * Sources: official government gazettes, EU employment law references.
 * Only national-level public holidays (not regional/optional).
 */

import { sql } from "./store.js";

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

// Easter 2026: Western (Catholic/Protestant) = April 5, Orthodox = April 12
const HOLIDAYS: Record<string, Holiday[]> = {
  // ─── Ukraine ───────────────────────────────────────────────────────────────
  UA: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-07", name: "Christmas (Orthodox)" },
    { date: "2026-03-08", name: "International Women's Day" },
    { date: "2026-04-12", name: "Easter (Orthodox)" },
    { date: "2026-04-13", name: "Easter Monday (Orthodox)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-09", name: "Victory Day over Nazism" },
    { date: "2026-05-31", name: "Holy Trinity Day" },
    { date: "2026-06-28", name: "Constitution Day" },
    { date: "2026-07-15", name: "Ukrainian Statehood Day" },
    { date: "2026-08-24", name: "Independence Day" },
    { date: "2026-10-01", name: "Defenders of Ukraine Day" },
    { date: "2026-10-14", name: "Defenders of Ukraine Day (observed)" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Austria (AT) ──────────────────────────────────────────────────────────
  AT: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-06-04", name: "Corpus Christi" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-10-26", name: "National Day" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-08", name: "Immaculate Conception" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St. Stephen's Day" },
  ],

  // ─── Belgium (BE) ──────────────────────────────────────────────────────────
  BE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-07-21", name: "Belgian National Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-11-11", name: "Armistice Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Bulgaria (BG) ────────────────────────────────────────────────────────
  BG: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-03-03", name: "Liberation Day" },
    { date: "2026-04-17", name: "Good Friday (Orthodox)" },
    { date: "2026-04-18", name: "Holy Saturday (Orthodox)" },
    { date: "2026-04-19", name: "Easter Sunday (Orthodox)" },
    { date: "2026-04-20", name: "Easter Monday (Orthodox)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-06", name: "St. George's Day" },
    { date: "2026-05-24", name: "Education and Culture Day" },
    { date: "2026-09-06", name: "Unification Day" },
    { date: "2026-09-22", name: "Independence Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Croatia (HR) ─────────────────────────────────────────────────────────
  HR: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-30", name: "Statehood Day" },
    { date: "2026-06-04", name: "Corpus Christi" },
    { date: "2026-06-22", name: "Anti-Fascist Struggle Day" },
    { date: "2026-08-05", name: "Victory and Homeland Thanksgiving Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-11-18", name: "Remembrance Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St. Stephen's Day" },
  ],

  // ─── Cyprus (CY) ──────────────────────────────────────────────────────────
  CY: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-03-02", name: "Green Monday" },
    { date: "2026-03-25", name: "Greek Independence Day" },
    { date: "2026-04-01", name: "Cyprus National Day" },
    { date: "2026-04-17", name: "Good Friday (Orthodox)" },
    { date: "2026-04-19", name: "Easter Sunday (Orthodox)" },
    { date: "2026-04-20", name: "Easter Monday (Orthodox)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-08", name: "Whit Monday (Orthodox)" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-10-01", name: "Cyprus Independence Day" },
    { date: "2026-10-28", name: "Ochi Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],

  // ─── Czech Republic (CZ) ──────────────────────────────────────────────────
  CZ: [
    { date: "2026-01-01", name: "New Year's Day / Restoration Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-08", name: "Liberation Day" },
    { date: "2026-07-05", name: "Saints Cyril and Methodius Day" },
    { date: "2026-07-06", name: "Jan Hus Day" },
    { date: "2026-09-28", name: "Czech Statehood Day" },
    { date: "2026-10-28", name: "Independent Czech State Day" },
    { date: "2026-11-17", name: "Freedom and Democracy Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Denmark (DK) ─────────────────────────────────────────────────────────
  DK: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-02", name: "Maundy Thursday" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Great Prayer Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-06-05", name: "Constitution Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Estonia (EE) ─────────────────────────────────────────────────────────
  EE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-24", name: "Independence Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-05-01", name: "Spring Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-06-23", name: "Victory Day" },
    { date: "2026-06-24", name: "Midsummer Day" },
    { date: "2026-08-20", name: "Day of Restoration of Independence" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],

  // ─── Finland (FI) ─────────────────────────────────────────────────────────
  FI: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "May Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-06-20", name: "Midsummer Eve" },
    { date: "2026-10-31", name: "All Saints' Day" },
    { date: "2026-12-06", name: "Independence Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],

  // ─── France (FR) ──────────────────────────────────────────────────────────
  FR: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-08", name: "Victory in Europe Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-07-14", name: "Bastille Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-11-11", name: "Armistice Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Germany (DE) ─────────────────────────────────────────────────────────
  DE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-10-03", name: "German Unity Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Greece (GR) ──────────────────────────────────────────────────────────
  GR: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-03-02", name: "Clean Monday" },
    { date: "2026-03-25", name: "Independence Day" },
    { date: "2026-04-17", name: "Good Friday (Orthodox)" },
    { date: "2026-04-19", name: "Easter Sunday (Orthodox)" },
    { date: "2026-04-20", name: "Easter Monday (Orthodox)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-08", name: "Whit Monday (Orthodox)" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-10-28", name: "Ochi Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Synaxis of the Theotokos" },
  ],

  // ─── Hungary (HU) ────────────────────────────────────────────────────────
  HU: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-03-15", name: "Revolution Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-08-20", name: "St. Stephen's Day" },
    { date: "2026-10-23", name: "Republic Day" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Ireland (IE) ─────────────────────────────────────────────────────────
  IE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-02", name: "St. Brigid's Day" },
    { date: "2026-03-17", name: "St. Patrick's Day" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-04", name: "May Bank Holiday" },
    { date: "2026-06-01", name: "June Bank Holiday" },
    { date: "2026-08-03", name: "August Bank Holiday" },
    { date: "2026-10-26", name: "October Bank Holiday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St. Stephen's Day" },
  ],

  // ─── Italy (IT) ───────────────────────────────────────────────────────────
  IT: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-25", name: "Liberation Day" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-02", name: "Republic Day" },
    { date: "2026-08-15", name: "Ferragosto" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-08", name: "Immaculate Conception" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St. Stephen's Day" },
  ],

  // ─── Latvia (LV) ──────────────────────────────────────────────────────────
  LV: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-04", name: "Restoration of Independence Day" },
    { date: "2026-06-23", name: "Midsummer Eve" },
    { date: "2026-06-24", name: "Midsummer Day" },
    { date: "2026-11-18", name: "Proclamation of the Republic" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
    { date: "2026-12-31", name: "New Year's Eve" },
  ],

  // ─── Lithuania (LT) ───────────────────────────────────────────────────────
  LT: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-16", name: "Restoration of the State Day" },
    { date: "2026-03-11", name: "Restoration of Independence Day" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-24", name: "St. John's Day" },
    { date: "2026-07-06", name: "Statehood Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-11-02", name: "All Souls' Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Luxembourg (LU) ──────────────────────────────────────────────────────
  LU: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-09", name: "Europe Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-06-23", name: "National Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St. Stephen's Day" },
  ],

  // ─── Malta (MT) ───────────────────────────────────────────────────────────
  MT: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-10", name: "Feast of St. Paul's Shipwreck" },
    { date: "2026-03-19", name: "Feast of St. Joseph" },
    { date: "2026-03-31", name: "Freedom Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "Workers' Day" },
    { date: "2026-06-07", name: "Sette Giugno" },
    { date: "2026-06-29", name: "Feast of Sts. Peter and Paul" },
    { date: "2026-08-15", name: "Feast of the Assumption" },
    { date: "2026-09-08", name: "Victory Day" },
    { date: "2026-09-21", name: "Independence Day" },
    { date: "2026-12-08", name: "Feast of the Immaculate Conception" },
    { date: "2026-12-13", name: "Republic Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Netherlands (NL) ─────────────────────────────────────────────────────
  NL: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-27", name: "King's Day" },
    { date: "2026-05-05", name: "Liberation Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Poland (PL) ──────────────────────────────────────────────────────────
  PL: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-03", name: "Constitution Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-06-04", name: "Corpus Christi" },
    { date: "2026-08-15", name: "Armed Forces Day / Assumption" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-11-11", name: "Independence Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Portugal (PT) ────────────────────────────────────────────────────────
  PT: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-17", name: "Carnival" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-25", name: "Freedom Day" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-04", name: "Corpus Christi" },
    { date: "2026-06-10", name: "Portugal Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-10-05", name: "Republic Day" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-01", name: "Restoration of Independence Day" },
    { date: "2026-12-08", name: "Immaculate Conception" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Romania (RO) ─────────────────────────────────────────────────────────
  RO: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "Day after New Year" },
    { date: "2026-01-24", name: "Union of the Principalities Day" },
    { date: "2026-04-17", name: "Good Friday (Orthodox)" },
    { date: "2026-04-19", name: "Easter Sunday (Orthodox)" },
    { date: "2026-04-20", name: "Easter Monday (Orthodox)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-01", name: "Children's Day" },
    { date: "2026-06-07", name: "Whit Sunday (Orthodox)" },
    { date: "2026-06-08", name: "Whit Monday (Orthodox)" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-11-30", name: "St. Andrew's Day" },
    { date: "2026-12-01", name: "National Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Slovakia (SK) ────────────────────────────────────────────────────────
  SK: [
    { date: "2026-01-01", name: "Day of the Establishment of the Slovak Republic" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-08", name: "Victory over Fascism Day" },
    { date: "2026-07-05", name: "Saints Cyril and Methodius Day" },
    { date: "2026-08-29", name: "Slovak National Uprising Day" },
    { date: "2026-09-01", name: "Constitution Day" },
    { date: "2026-09-15", name: "Our Lady of Sorrows" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-11-17", name: "Freedom and Democracy Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Slovenia (SI) ────────────────────────────────────────────────────────
  SI: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "New Year's Holiday" },
    { date: "2026-02-08", name: "Prešeren Day" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-27", name: "Day of Uprising Against Occupation" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-02", name: "Labour Day Holiday" },
    { date: "2026-06-08", name: "Whit Sunday" },
    { date: "2026-06-25", name: "Statehood Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-10-31", name: "Reformation Day" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Independence and Unity Day" },
  ],

  // ─── Spain (ES) ───────────────────────────────────────────────────────────
  ES: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-08-15", name: "Assumption of Mary" },
    { date: "2026-10-12", name: "Fiesta Nacional de España" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-06", name: "Constitution Day" },
    { date: "2026-12-08", name: "Immaculate Conception" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Sweden (SE) ──────────────────────────────────────────────────────────
  SE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-06", name: "Epiphany" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-06-06", name: "National Day" },
    { date: "2026-06-20", name: "Midsummer Eve" },
    { date: "2026-10-31", name: "All Saints' Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],
};

async function seed() {
  let total = 0;
  for (const [country, holidays] of Object.entries(HOLIDAYS)) {
    for (const h of holidays) {
      await sql`
        INSERT INTO public_holidays (country_code, date, name)
        VALUES (${country}, ${h.date}, ${h.name})
        ON CONFLICT (country_code, date) DO UPDATE SET name = ${h.name}
      `;
      total++;
    }
    console.log(`  ${country}: ${holidays.length} holidays`);
  }
  console.log(`\nSeeded ${total} holidays for ${Object.keys(HOLIDAYS).length} countries.`);
  await sql.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
