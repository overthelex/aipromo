/**
 * Seed public holidays for 58 countries for 2026:
 * Ukraine, 27 EU, 5 Anglosphere, 5 Asia, 5 Middle East, 5 LatAm/BRICS, 5 Europe non-EU, 5 Africa.
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Anglosphere
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── United States (US) ───────────────────────────────────────────────────
  US: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
    { date: "2026-02-16", name: "Presidents' Day" },
    { date: "2026-05-25", name: "Memorial Day" },
    { date: "2026-06-19", name: "Juneteenth" },
    { date: "2026-07-03", name: "Independence Day (observed)" },
    { date: "2026-07-04", name: "Independence Day" },
    { date: "2026-09-07", name: "Labor Day" },
    { date: "2026-10-12", name: "Columbus Day" },
    { date: "2026-11-11", name: "Veterans Day" },
    { date: "2026-11-26", name: "Thanksgiving Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Canada (CA) ──────────────────────────────────────────────────────────
  CA: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-16", name: "Family Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-18", name: "Victoria Day" },
    { date: "2026-07-01", name: "Canada Day" },
    { date: "2026-08-03", name: "Civic Holiday" },
    { date: "2026-09-07", name: "Labour Day" },
    { date: "2026-09-30", name: "National Day for Truth and Reconciliation" },
    { date: "2026-10-12", name: "Thanksgiving Day" },
    { date: "2026-11-11", name: "Remembrance Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-28", name: "Boxing Day (observed)" },
  ],

  // ─── United Kingdom (GB) ──────────────────────────────────────────────────
  GB: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-04", name: "Early May Bank Holiday" },
    { date: "2026-05-25", name: "Spring Bank Holiday" },
    { date: "2026-08-31", name: "Summer Bank Holiday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-28", name: "Boxing Day (observed)" },
  ],

  // ─── Australia (AU) ───────────────────────────────────────────────────────
  AU: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-26", name: "Australia Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-04", name: "Saturday before Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-25", name: "Anzac Day" },
    { date: "2026-06-08", name: "Queen's Birthday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-28", name: "Boxing Day (observed)" },
  ],

  // ─── New Zealand (NZ) ────────────────────────────────────────────────────
  NZ: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "Day after New Year's Day" },
    { date: "2026-02-06", name: "Waitangi Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-27", name: "Anzac Day (observed)" },
    { date: "2026-06-01", name: "Queen's Birthday" },
    { date: "2026-06-20", name: "Matariki" },
    { date: "2026-10-26", name: "Labour Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-28", name: "Boxing Day (observed)" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // Asia-Pacific
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Japan (JP) ───────────────────────────────────────────────────────────
  JP: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "New Year's Day (Bank Holiday)" },
    { date: "2026-01-03", name: "New Year's Day (Bank Holiday)" },
    { date: "2026-01-12", name: "Coming of Age Day" },
    { date: "2026-02-11", name: "National Foundation Day" },
    { date: "2026-02-23", name: "Emperor's Birthday" },
    { date: "2026-03-20", name: "Vernal Equinox Day" },
    { date: "2026-04-29", name: "Showa Day" },
    { date: "2026-05-03", name: "Constitution Memorial Day" },
    { date: "2026-05-04", name: "Greenery Day" },
    { date: "2026-05-05", name: "Children's Day" },
    { date: "2026-05-06", name: "Children's Day (Observed)" },
    { date: "2026-07-20", name: "Marine Day" },
    { date: "2026-08-11", name: "Mountain Day" },
    { date: "2026-09-21", name: "Respect for the Aged Day" },
    { date: "2026-09-22", name: "National Holiday" },
    { date: "2026-09-23", name: "Autumnal Equinox Day" },
    { date: "2026-10-12", name: "Sports Day" },
    { date: "2026-11-03", name: "Culture Day" },
    { date: "2026-11-23", name: "Labor Thanksgiving Day" },
  ],

  // ─── South Korea (KR) ────────────────────────────────────────────────────
  KR: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-16", name: "Lunar New Year Holiday" },
    { date: "2026-02-17", name: "Lunar New Year" },
    { date: "2026-02-18", name: "Lunar New Year Holiday" },
    { date: "2026-03-01", name: "Independence Movement Day" },
    { date: "2026-05-05", name: "Children's Day" },
    { date: "2026-05-24", name: "Buddha's Birthday" },
    { date: "2026-06-06", name: "Memorial Day" },
    { date: "2026-08-15", name: "Liberation Day" },
    { date: "2026-09-24", name: "Chuseok Holiday" },
    { date: "2026-09-25", name: "Chuseok" },
    { date: "2026-09-26", name: "Chuseok Holiday" },
    { date: "2026-10-03", name: "National Foundation Day" },
    { date: "2026-10-09", name: "Hangul Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Singapore (SG) ──────────────────────────────────────────────────────
  SG: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-29", name: "Chinese New Year" },
    { date: "2026-01-30", name: "Chinese New Year (Second Day)" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-12", name: "Vesak Day" },
    { date: "2026-06-26", name: "Hari Raya Haji" },
    { date: "2026-07-17", name: "Hari Raya Puasa" },
    { date: "2026-08-09", name: "National Day" },
    { date: "2026-08-10", name: "National Day (Observed)" },
    { date: "2026-10-20", name: "Deepavali" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Hong Kong (HK) ──────────────────────────────────────────────────────
  HK: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-17", name: "Lunar New Year's Day" },
    { date: "2026-02-18", name: "Second Day of Lunar New Year" },
    { date: "2026-02-19", name: "Third Day of Lunar New Year" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-04", name: "The Day Following Good Friday" },
    { date: "2026-04-05", name: "Ching Ming Festival" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-07", name: "Ching Ming Festival (Observed)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-24", name: "The Birthday of the Buddha" },
    { date: "2026-05-25", name: "The Birthday of the Buddha (Observed)" },
    { date: "2026-06-19", name: "Tuen Ng Festival" },
    { date: "2026-07-01", name: "HKSAR Establishment Day" },
    { date: "2026-10-01", name: "National Day" },
    { date: "2026-10-07", name: "Day Following Chinese Mid-Autumn Festival" },
    { date: "2026-10-26", name: "Chung Yeung Festival" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "The First Weekday After Christmas Day" },
  ],

  // ─── Taiwan (TW) ─────────────────────────────────────────────────────────
  TW: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "New Year's Day (Observed)" },
    { date: "2026-02-14", name: "Lunar New Year's Eve" },
    { date: "2026-02-15", name: "Lunar New Year Holiday" },
    { date: "2026-02-16", name: "Lunar New Year Holiday" },
    { date: "2026-02-17", name: "Lunar New Year" },
    { date: "2026-02-18", name: "Lunar New Year Holiday" },
    { date: "2026-02-19", name: "Lunar New Year Holiday" },
    { date: "2026-02-20", name: "Lunar New Year Holiday" },
    { date: "2026-02-28", name: "Peace Memorial Day" },
    { date: "2026-04-04", name: "Children's Day" },
    { date: "2026-04-05", name: "Tomb Sweeping Day" },
    { date: "2026-04-06", name: "Tomb Sweeping Day (Observed)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-19", name: "Dragon Boat Festival" },
    { date: "2026-10-06", name: "Mid-Autumn Festival" },
    { date: "2026-10-10", name: "National Day" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // Middle East
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── UAE (AE) ─────────────────────────────────────────────────────────────
  AE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-18", name: "Start of Ramadan" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr" },
    { date: "2026-03-22", name: "Eid al-Fitr" },
    { date: "2026-05-27", name: "Arafat Day" },
    { date: "2026-05-28", name: "Eid al-Adha" },
    { date: "2026-05-29", name: "Eid al-Adha" },
    { date: "2026-05-30", name: "Eid al-Adha" },
    { date: "2026-06-17", name: "Islamic New Year" },
    { date: "2026-08-26", name: "Prophet Muhammad's Birthday" },
    { date: "2026-11-30", name: "Commemoration Day" },
    { date: "2026-12-01", name: "National Day" },
    { date: "2026-12-02", name: "National Day" },
    { date: "2026-12-03", name: "National Day" },
  ],

  // ─── Saudi Arabia (SA) ───────────────────────────────────────────────────
  SA: [
    { date: "2026-02-22", name: "Founding Day" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr" },
    { date: "2026-03-22", name: "Eid al-Fitr" },
    { date: "2026-03-23", name: "Eid al-Fitr" },
    { date: "2026-05-27", name: "Arafat Day" },
    { date: "2026-05-28", name: "Eid al-Adha" },
    { date: "2026-05-29", name: "Eid al-Adha" },
    { date: "2026-05-30", name: "Eid al-Adha" },
    { date: "2026-09-23", name: "Saudi National Day" },
  ],

  // ─── Israel (IL) ──────────────────────────────────────────────────────────
  IL: [
    { date: "2026-04-02", name: "Passover" },
    { date: "2026-04-03", name: "Passover" },
    { date: "2026-04-08", name: "Passover" },
    { date: "2026-04-15", name: "Yom HaShoah" },
    { date: "2026-04-22", name: "Yom HaZikaron" },
    { date: "2026-04-23", name: "Yom HaAtzmaut" },
    { date: "2026-05-22", name: "Shavuot" },
    { date: "2026-09-12", name: "Rosh Hashanah" },
    { date: "2026-09-13", name: "Rosh Hashanah" },
    { date: "2026-09-21", name: "Yom Kippur" },
    { date: "2026-09-26", name: "Sukkot" },
    { date: "2026-10-03", name: "Simchat Torah" },
  ],

  // ─── Qatar (QA) ──────────────────────────────────────────────────────────
  QA: [
    { date: "2026-02-09", name: "Qatar Sports Day" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr" },
    { date: "2026-03-22", name: "Eid al-Fitr" },
    { date: "2026-05-27", name: "Arafat Day" },
    { date: "2026-05-28", name: "Eid al-Adha" },
    { date: "2026-05-29", name: "Eid al-Adha" },
    { date: "2026-05-30", name: "Eid al-Adha" },
    { date: "2026-06-17", name: "Islamic New Year" },
    { date: "2026-12-18", name: "Qatar National Day" },
  ],

  // ─── Bahrain (BH) ────────────────────────────────────────────────────────
  BH: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr" },
    { date: "2026-03-22", name: "Eid al-Fitr" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-27", name: "Arafat Day" },
    { date: "2026-05-28", name: "Eid al-Adha" },
    { date: "2026-05-29", name: "Eid al-Adha" },
    { date: "2026-05-30", name: "Eid al-Adha" },
    { date: "2026-06-17", name: "Islamic New Year" },
    { date: "2026-07-27", name: "Ashura" },
    { date: "2026-07-28", name: "Ashura" },
    { date: "2026-08-26", name: "Prophet Muhammad's Birthday" },
    { date: "2026-12-16", name: "Bahrain National Day" },
    { date: "2026-12-17", name: "Bahrain National Day" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // Latin America + BRICS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── India (IN) ───────────────────────────────────────────────────────────
  IN: [
    { date: "2026-01-26", name: "Republic Day" },
    { date: "2026-03-10", name: "Maha Shivaratri" },
    { date: "2026-03-17", name: "Holi" },
    { date: "2026-03-31", name: "Eid al-Fitr" },
    { date: "2026-04-02", name: "Ram Navami" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Mahavir Jayanti" },
    { date: "2026-05-01", name: "May Day" },
    { date: "2026-05-24", name: "Buddha Purnima" },
    { date: "2026-06-07", name: "Eid al-Adha" },
    { date: "2026-07-07", name: "Muharram" },
    { date: "2026-08-15", name: "Independence Day" },
    { date: "2026-08-25", name: "Janmashtami" },
    { date: "2026-09-05", name: "Milad-un-Nabi" },
    { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
    { date: "2026-10-20", name: "Dussehra" },
    { date: "2026-11-08", name: "Diwali" },
    { date: "2026-11-10", name: "Diwali (observed)" },
    { date: "2026-11-24", name: "Guru Nanak Jayanti" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Brazil (BR) ─────────────────────────────────────────────────────────
  BR: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-16", name: "Carnival (Monday)" },
    { date: "2026-02-17", name: "Carnival (Tuesday)" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-21", name: "Tiradentes" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-04", name: "Corpus Christi" },
    { date: "2026-09-07", name: "Independence Day" },
    { date: "2026-10-12", name: "Nossa Senhora Aparecida" },
    { date: "2026-11-02", name: "All Souls' Day" },
    { date: "2026-11-15", name: "Republic Day" },
    { date: "2026-11-20", name: "Black Awareness Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Mexico (MX) ─────────────────────────────────────────────────────────
  MX: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-02", name: "Constitution Day" },
    { date: "2026-03-16", name: "Benito Juárez's Birthday" },
    { date: "2026-04-02", name: "Holy Thursday" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-09-16", name: "Independence Day" },
    { date: "2026-10-01", name: "Presidential Transition" },
    { date: "2026-11-16", name: "Revolution Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Chile (CL) ──────────────────────────────────────────────────────────
  CL: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-04", name: "Holy Saturday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-21", name: "Navy Day" },
    { date: "2026-06-29", name: "Saints Peter and Paul" },
    { date: "2026-07-16", name: "Virgen del Carmen" },
    { date: "2026-08-15", name: "Assumption" },
    { date: "2026-09-18", name: "Independence Day" },
    { date: "2026-09-19", name: "Army Day" },
    { date: "2026-10-12", name: "Columbus Day" },
    { date: "2026-10-31", name: "Reformation Day" },
    { date: "2026-11-01", name: "All Saints' Day" },
    { date: "2026-12-08", name: "Immaculate Conception" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ─── Colombia (CO) ───────────────────────────────────────────────────────
  CO: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-12", name: "Epiphany (observed)" },
    { date: "2026-03-23", name: "Saint Joseph's Day (observed)" },
    { date: "2026-04-02", name: "Holy Thursday" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-18", name: "Ascension (observed)" },
    { date: "2026-06-08", name: "Corpus Christi (observed)" },
    { date: "2026-06-15", name: "Sacred Heart (observed)" },
    { date: "2026-06-29", name: "Saints Peter and Paul (observed)" },
    { date: "2026-07-20", name: "Independence Day" },
    { date: "2026-08-07", name: "Battle of Boyacá" },
    { date: "2026-08-17", name: "Assumption (observed)" },
    { date: "2026-10-12", name: "Columbus Day" },
    { date: "2026-11-02", name: "All Saints' Day (observed)" },
    { date: "2026-11-16", name: "Independence of Cartagena (observed)" },
    { date: "2026-12-08", name: "Immaculate Conception" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // Europe (non-EU)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Switzerland (CH) ────────────────────────────────────────────────────
  CH: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "Berchtoldstag" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-08-01", name: "Swiss National Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St. Stephen's Day" },
  ],

  // ─── Norway (NO) ─────────────────────────────────────────────────────────
  NO: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-02", name: "Maundy Thursday" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-17", name: "Constitution Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
  ],

  // ─── Iceland (IS) ────────────────────────────────────────────────────────
  IS: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-02", name: "Maundy Thursday" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-05", name: "Easter Sunday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-04-23", name: "First Day of Summer" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-14", name: "Ascension Day" },
    { date: "2026-05-24", name: "Whit Sunday" },
    { date: "2026-05-25", name: "Whit Monday" },
    { date: "2026-06-17", name: "Icelandic National Day" },
    { date: "2026-08-03", name: "Commerce Day" },
    { date: "2026-12-24", name: "Christmas Eve" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Second Day of Christmas" },
    { date: "2026-12-31", name: "New Year's Eve" },
  ],

  // ─── Serbia (RS) ─────────────────────────────────────────────────────────
  RS: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "New Year's Holiday" },
    { date: "2026-01-07", name: "Orthodox Christmas" },
    { date: "2026-02-15", name: "Statehood Day" },
    { date: "2026-02-16", name: "Statehood Day Holiday" },
    { date: "2026-04-10", name: "Orthodox Good Friday" },
    { date: "2026-04-11", name: "Orthodox Holy Saturday" },
    { date: "2026-04-12", name: "Orthodox Easter Sunday" },
    { date: "2026-04-13", name: "Orthodox Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-02", name: "Labour Day Holiday" },
    { date: "2026-11-11", name: "Armistice Day" },
  ],

  // ─── Bosnia and Herzegovina (BA) ─────────────────────────────────────────
  BA: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-02", name: "New Year's Holiday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-02", name: "Labour Day Holiday" },
    { date: "2026-11-25", name: "Statehood Day" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // Africa
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── South Africa (ZA) ───────────────────────────────────────────────────
  ZA: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-03-21", name: "Human Rights Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Family Day" },
    { date: "2026-04-27", name: "Freedom Day" },
    { date: "2026-05-01", name: "Workers' Day" },
    { date: "2026-06-16", name: "Youth Day" },
    { date: "2026-08-09", name: "National Women's Day" },
    { date: "2026-08-10", name: "National Women's Day (observed)" },
    { date: "2026-09-24", name: "Heritage Day" },
    { date: "2026-12-16", name: "Day of Reconciliation" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Day of Goodwill" },
  ],

  // ─── Nigeria (NG) ────────────────────────────────────────────────────────
  NG: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr Holiday" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Workers' Day" },
    { date: "2026-05-27", name: "Eid al-Adha" },
    { date: "2026-05-28", name: "Eid al-Adha Holiday" },
    { date: "2026-06-12", name: "Democracy Day" },
    { date: "2026-06-16", name: "Eid al-Mawlid" },
    { date: "2026-10-01", name: "Independence Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],

  // ─── Kenya (KE) ──────────────────────────────────────────────────────────
  KE: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-27", name: "Eid al-Adha" },
    { date: "2026-06-01", name: "Madaraka Day" },
    { date: "2026-10-10", name: "Huduma Day" },
    { date: "2026-10-20", name: "Mashujaa Day" },
    { date: "2026-12-12", name: "Jamhuri Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],

  // ─── Egypt (EG) ──────────────────────────────────────────────────────────
  EG: [
    { date: "2026-01-07", name: "Coptic Christmas" },
    { date: "2026-01-25", name: "Revolution Day (January 25)" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr Holiday" },
    { date: "2026-03-22", name: "Eid al-Fitr Holiday" },
    { date: "2026-04-20", name: "Sham el-Nessim" },
    { date: "2026-04-25", name: "Sinai Liberation Day" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-27", name: "Eid al-Adha" },
    { date: "2026-05-28", name: "Eid al-Adha Holiday" },
    { date: "2026-05-29", name: "Eid al-Adha Holiday" },
    { date: "2026-06-16", name: "Islamic New Year" },
    { date: "2026-06-30", name: "Revolution Day (June 30)" },
    { date: "2026-07-23", name: "Revolution Day (July 23)" },
    { date: "2026-08-25", name: "Prophet's Birthday" },
    { date: "2026-10-06", name: "Armed Forces Day" },
  ],

  // ─── Morocco (MA) ────────────────────────────────────────────────────────
  MA: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-11", name: "Independence Manifesto Day" },
    { date: "2026-03-20", name: "Eid al-Fitr" },
    { date: "2026-03-21", name: "Eid al-Fitr Holiday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-27", name: "Eid al-Adha" },
    { date: "2026-05-28", name: "Eid al-Adha Holiday" },
    { date: "2026-06-16", name: "Islamic New Year" },
    { date: "2026-07-30", name: "Throne Day" },
    { date: "2026-08-14", name: "Oued Ed-Dahab Day" },
    { date: "2026-08-20", name: "Revolution of the King and the People" },
    { date: "2026-08-21", name: "Youth Day" },
    { date: "2026-08-25", name: "Prophet's Birthday" },
    { date: "2026-08-26", name: "Prophet's Birthday Holiday" },
    { date: "2026-11-06", name: "Green March Day" },
    { date: "2026-11-18", name: "Independence Day" },
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
