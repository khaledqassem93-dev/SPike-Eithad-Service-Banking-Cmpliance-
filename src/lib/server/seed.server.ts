import type DatabaseType from "better-sqlite3";

import type { Ubo } from "../kyc-types";
import {
  screenAccount,
  type ScreeningAccountFacts,
  type WatchlistEntry,
} from "./screening.server";

// Idempotent seed. Populates a realistic corporate book (~40 accounts) with
// beneficial owners and a sanctions/PEP watchlist, then runs the real
// screening engine so every risk score, KYC status and sanctions/ownership
// change in the DB is *computed*, not hand-written. Contextual signals
// (adverse media, litigation, etc.) are seeded as ingested-source records.

/* ---------------- date + rng helpers ---------------- */

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const todayIso = () => new Date().toISOString().slice(0, 10);

// Deterministic LCG so generated accounts are reproducible across seeds.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* ---------------- watchlist ---------------- */

const WATCHLIST: WatchlistEntry[] = [
  { id: "wl-1", name: "Yuliya Kaverina", listSource: "OFAC SDN", program: "RUSSIA-EO14024", country: "Russia" },
  { id: "wl-2", name: "Dmitri Volkov", listSource: "OFAC SDN", program: "SDGT", country: "Russia" },
  { id: "wl-3", name: "Reza Najafi", listSource: "OFAC SDN", program: "IRAN", country: "Iran" },
  { id: "wl-4", name: "Ahmed Al-Mansouri", listSource: "UN Consolidated", program: "Al-Qaida", country: "Syria" },
  { id: "wl-5", name: "Sergei Morozov", listSource: "EU", program: "Russia restrictive measures", country: "Russia" },
  { id: "wl-6", name: "Viktor Petrov", listSource: "EU", program: "Russia restrictive measures", country: "Russia" },
  { id: "wl-7", name: "Kim Jong-Ho", listSource: "UN Consolidated", program: "DPRK", country: "North Korea" },
  { id: "wl-8", name: "Carlos Mendez Rivera", listSource: "PEP", program: "Regional minister", country: "Spain" },
  { id: "wl-9", name: "Fatima Al-Sabah", listSource: "PEP", program: "State-owned enterprise board", country: "Kuwait" },
  { id: "wl-10", name: "Olawale Adeyemi", listSource: "PEP", program: "Senator", country: "Nigeria" },
  { id: "wl-11", name: "Ibrahim Tour", listSource: "OFAC SDN", program: "SDGT", country: "Mali" },
  { id: "wl-12", name: "Elena Sokolova", listSource: "EU", program: "Russia restrictive measures", country: "Russia" },
  { id: "wl-13", name: "Hassan Rahimi", listSource: "OFAC SDN", program: "IRAN", country: "Iran" },
  { id: "wl-14", name: "Pavel Orlov", listSource: "PEP", program: "Deputy governor", country: "Russia" },
];

/* ---------------- seed account shape ---------------- */

interface SeedUbo {
  name: string;
  ownershipPct: number;
  nationality: string;
  isPep: boolean;
  dob?: string;
}
interface SeedContextChange {
  type: "address" | "directors" | "litigation" | "financials" | "industry" | "media";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  source: string;
  summary: string;
  before?: string;
  after?: string;
  detectedOffsetDays: number;
  status?: "open" | "acknowledged" | "resolved";
}
interface SeedAccount {
  id: string;
  legalName: string;
  ticker?: string;
  industry: string;
  country: string;
  jurisdiction: string;
  incorporated: string;
  revenue: string;
  relationshipManager: string;
  accountsHeld: number;
  exposureUSD: number;
  highRiskJurisdiction: boolean;
  adverseMediaCount: number;
  litigationFlag: boolean;
  lastReview: string;
  nextReviewOffsetDays: number;
  manualInReview?: boolean;
  ubos: SeedUbo[];
  contextChanges: SeedContextChange[];
}

/* ---------------- hand-authored accounts (rich narratives) ---------------- */

const CURATED: SeedAccount[] = [
  {
    id: "ACC-10293",
    legalName: "Meridian Logistics Holdings Ltd.",
    ticker: "MRLH",
    industry: "Freight & Logistics",
    country: "Singapore",
    jurisdiction: "SG / Cayman SPV",
    incorporated: "2011-04-18",
    revenue: "$2.4B",
    relationshipManager: "A. Okafor",
    accountsHeld: 12,
    exposureUSD: 184_300_000,
    highRiskJurisdiction: true,
    adverseMediaCount: 3,
    litigationFlag: false,
    lastReview: "2024-02-11",
    nextReviewOffsetDays: -21,
    ubos: [
      { name: "Yuliya Kaverina", ownershipPct: 31.7, nationality: "Russia", isPep: false, dob: "1979-03-12" },
      { name: "Lim Wei Chen", ownershipPct: 22.0, nationality: "Singapore", isPep: false, dob: "1968-08-04" },
      { name: "Robert Hale", ownershipPct: 18.0, nationality: "United Kingdom", isPep: false, dob: "1972-01-22" },
    ],
    contextChanges: [
      {
        type: "media",
        severity: "medium",
        confidence: 78,
        source: "Adverse media scan (Reuters, FT)",
        summary: "3 adverse articles re: an EU customs investigation into transshipment routing.",
        detectedOffsetDays: -1,
      },
    ],
  },
  {
    id: "ACC-10455",
    legalName: "Atlas Renewables S.A.",
    industry: "Energy",
    country: "Spain",
    jurisdiction: "ES",
    incorporated: "2016-09-02",
    revenue: "$780M",
    relationshipManager: "M. Vasquez",
    accountsHeld: 5,
    exposureUSD: 42_900_000,
    highRiskJurisdiction: false,
    adverseMediaCount: 0,
    litigationFlag: false,
    lastReview: "2025-07-22",
    nextReviewOffsetDays: 9,
    ubos: [
      { name: "Carlos Mendez Rivera", ownershipPct: 12.0, nationality: "Spain", isPep: true, dob: "1965-11-30" },
      { name: "Ana Belen Ruiz", ownershipPct: 20.0, nationality: "Spain", isPep: false, dob: "1980-05-18" },
    ],
    contextChanges: [
      {
        type: "directors",
        severity: "medium",
        confidence: 92,
        source: "BORME registry",
        summary: "Two new directors appointed; one with PEP exposure (regional minister, Andalusia).",
        before: "5 directors",
        after: "7 directors (1 PEP)",
        detectedOffsetDays: -4,
      },
      {
        type: "financials",
        severity: "low",
        confidence: 81,
        source: "Audited filings",
        summary: "Revenue down 14% YoY; debt covenants approaching threshold.",
        detectedOffsetDays: -8,
        status: "acknowledged",
      },
    ],
  },
  {
    id: "ACC-10781",
    legalName: "Northwind Pharma Inc.",
    ticker: "NWPH",
    industry: "Pharmaceuticals",
    country: "USA",
    jurisdiction: "DE, US",
    incorporated: "2008-01-14",
    revenue: "$5.1B",
    relationshipManager: "R. Chen",
    accountsHeld: 9,
    exposureUSD: 311_400_000,
    highRiskJurisdiction: false,
    adverseMediaCount: 0,
    litigationFlag: false,
    lastReview: "2026-04-02",
    nextReviewOffsetDays: 312,
    ubos: [{ name: "Susan Park", ownershipPct: 9.0, nationality: "USA", isPep: false, dob: "1975-06-09" }],
    contextChanges: [
      {
        type: "industry",
        severity: "low",
        confidence: 73,
        source: "FDA bulletin",
        summary: "Class II recall — minor; no AML/KYC impact.",
        detectedOffsetDays: -3,
        status: "resolved",
      },
    ],
  },
  {
    id: "ACC-10912",
    legalName: "Halcyon Capital Partners LP",
    industry: "Private Equity",
    country: "Cayman Islands",
    jurisdiction: "KY",
    incorporated: "2019-11-30",
    revenue: "$310M (AUM $4.2B)",
    relationshipManager: "S. Patel",
    accountsHeld: 18,
    exposureUSD: 96_700_000,
    highRiskJurisdiction: true,
    adverseMediaCount: 1,
    litigationFlag: true,
    lastReview: "2025-12-01",
    nextReviewOffsetDays: -3,
    manualInReview: true,
    ubos: [
      { name: "Sergei Morozov", ownershipPct: 9.0, nationality: "Russia", isPep: false, dob: "1971-02-14" },
      { name: "James Whitfield", ownershipPct: 27.0, nationality: "USA", isPep: false, dob: "1969-09-01" },
    ],
    contextChanges: [
      {
        type: "litigation",
        severity: "medium",
        confidence: 84,
        source: "PACER",
        summary: "Securities class-action filed in SDNY against the fund's GP.",
        detectedOffsetDays: -12,
      },
    ],
  },
  {
    id: "ACC-11023",
    legalName: "Sahel Agritech Cooperative",
    industry: "Agriculture",
    country: "Kenya",
    jurisdiction: "KE",
    incorporated: "2014-05-09",
    revenue: "$120M",
    relationshipManager: "A. Okafor",
    accountsHeld: 3,
    exposureUSD: 8_400_000,
    highRiskJurisdiction: false,
    adverseMediaCount: 0,
    litigationFlag: false,
    lastReview: "2025-09-18",
    nextReviewOffsetDays: 22,
    ubos: [{ name: "Joseph Kamau", ownershipPct: 15.0, nationality: "Kenya", isPep: false, dob: "1983-12-02" }],
    contextChanges: [
      {
        type: "address",
        severity: "low",
        confidence: 95,
        source: "Postal registry",
        summary: "Registered office moved within Nairobi CBD.",
        detectedOffsetDays: -1,
        status: "resolved",
      },
    ],
  },
  {
    id: "ACC-11210",
    legalName: "Kobayashi Robotics K.K.",
    industry: "Industrial Tech",
    country: "Japan",
    jurisdiction: "JP",
    incorporated: "2003-02-20",
    revenue: "$1.7B",
    relationshipManager: "R. Chen",
    accountsHeld: 6,
    exposureUSD: 67_300_000,
    highRiskJurisdiction: false,
    adverseMediaCount: 0,
    litigationFlag: false,
    lastReview: "2026-05-12",
    nextReviewOffsetDays: 340,
    ubos: [],
    contextChanges: [],
  },
  {
    id: "ACC-11488",
    legalName: "BlueRock Maritime DMCC",
    industry: "Shipping",
    country: "UAE",
    jurisdiction: "AE (DMCC)",
    incorporated: "2018-08-15",
    revenue: "$640M",
    relationshipManager: "M. Vasquez",
    accountsHeld: 7,
    exposureUSD: 54_100_000,
    highRiskJurisdiction: true,
    adverseMediaCount: 2,
    litigationFlag: false,
    lastReview: "2024-11-08",
    nextReviewOffsetDays: -46,
    ubos: [
      { name: "Dmitri Volkov", ownershipPct: 40.0, nationality: "Russia", isPep: false, dob: "1974-07-19" },
      { name: "Khalid Al Maktoum", ownershipPct: 30.0, nationality: "UAE", isPep: false, dob: "1981-03-03" },
    ],
    contextChanges: [
      {
        type: "media",
        severity: "high",
        confidence: 86,
        source: "Vessel-tracking AI (AIS dark periods)",
        summary: "Two vessels showed AIS gaps near sanctioned ports in the last 30 days.",
        detectedOffsetDays: -7,
      },
      {
        type: "directors",
        severity: "medium",
        confidence: 85,
        source: "DMCC registry",
        summary: "Nominee director change — beneficial control verification pending.",
        detectedOffsetDays: -15,
      },
    ],
  },
  {
    id: "ACC-11633",
    legalName: "Cedar & Stone Property Group",
    industry: "Real Estate",
    country: "United Kingdom",
    jurisdiction: "GB / Jersey",
    incorporated: "2012-06-21",
    revenue: "$430M",
    relationshipManager: "S. Patel",
    accountsHeld: 8,
    exposureUSD: 73_500_000,
    highRiskJurisdiction: false,
    adverseMediaCount: 1,
    litigationFlag: false,
    lastReview: "2025-10-30",
    nextReviewOffsetDays: 12,
    ubos: [
      { name: "Pavel Orlov", ownershipPct: 26.0, nationality: "Russia", isPep: true, dob: "1966-04-25" },
      { name: "Margaret Doyle", ownershipPct: 24.0, nationality: "Ireland", isPep: false, dob: "1977-10-11" },
    ],
    contextChanges: [
      {
        type: "media",
        severity: "medium",
        confidence: 70,
        source: "Adverse media scan",
        summary: "Press coverage links a beneficial owner to opaque offshore structures.",
        detectedOffsetDays: -20,
      },
    ],
  },
  {
    id: "ACC-11790",
    legalName: "Andes Copper Mining SpA",
    industry: "Mining & Metals",
    country: "Chile",
    jurisdiction: "CL",
    incorporated: "2010-03-17",
    revenue: "$2.9B",
    relationshipManager: "M. Vasquez",
    accountsHeld: 10,
    exposureUSD: 142_000_000,
    highRiskJurisdiction: false,
    adverseMediaCount: 0,
    litigationFlag: true,
    lastReview: "2026-01-20",
    nextReviewOffsetDays: 64,
    ubos: [{ name: "Diego Fuentes", ownershipPct: 33.0, nationality: "Chile", isPep: false, dob: "1970-02-08" }],
    contextChanges: [
      {
        type: "litigation",
        severity: "medium",
        confidence: 80,
        source: "Local court filings",
        summary: "Environmental-damage suit filed by a regional community group.",
        detectedOffsetDays: -33,
        status: "acknowledged",
      },
    ],
  },
  {
    id: "ACC-11842",
    legalName: "Crescent Digital Pay PLC",
    industry: "Fintech / Payments",
    country: "Nigeria",
    jurisdiction: "NG",
    incorporated: "2020-01-09",
    revenue: "$95M",
    relationshipManager: "A. Okafor",
    accountsHeld: 4,
    exposureUSD: 21_700_000,
    highRiskJurisdiction: true,
    adverseMediaCount: 2,
    litigationFlag: false,
    lastReview: "2025-08-14",
    nextReviewOffsetDays: -5,
    ubos: [
      { name: "Olawale Adeyemi", ownershipPct: 35.0, nationality: "Nigeria", isPep: true, dob: "1978-05-27" },
    ],
    contextChanges: [
      {
        type: "industry",
        severity: "medium",
        confidence: 76,
        source: "Regulator bulletin (CBN)",
        summary: "Payments licence under review following a liquidity inquiry.",
        detectedOffsetDays: -9,
      },
    ],
  },
];

/* ---------------- generated accounts (deterministic) ---------------- */

const NAME_PREFIX = [
  "Vanguard", "Summit", "Harbor", "Ironforge", "Lakeside", "Solstice", "Granite",
  "Aurora", "Pioneer", "Keystone", "Beacon", "Trident", "Falcon", "Monarch",
  "Sterling", "Cobalt", "Vertex", "Helios", "Magnolia", "Onyx", "Pinnacle", "Zephyr",
  "Crimson", "Nimbus", "Quartz", "Sable", "Tundra", "Vesper", "Willow", "Apex",
];
const NAME_SUFFIX = [
  "Holdings", "Industries", "Capital", "Trading Co.", "Group", "Partners LP",
  "Technologies", "Resources", "Ventures", "Global", "Enterprises", "Logistics",
];
const INDUSTRIES = [
  "Manufacturing", "Wholesale Trade", "Construction", "Hospitality", "Telecom",
  "Insurance", "Consumer Goods", "Media", "Healthcare", "Automotive", "Chemicals",
  "Aviation",
];
const COUNTRIES: Array<[string, string, boolean]> = [
  ["Germany", "DE", false], ["France", "FR", false], ["USA", "US", false],
  ["Brazil", "BR", false], ["India", "IN", false], ["Turkey", "TR", true],
  ["Panama", "PA", true], ["Cyprus", "CY", true], ["Switzerland", "CH", false],
  ["Canada", "CA", false], ["Mexico", "MX", false], ["Indonesia", "ID", false],
  ["Lebanon", "LB", true], ["Malta", "MT", true],
];
const RMS = ["A. Okafor", "M. Vasquez", "R. Chen", "S. Patel", "N. Haddad", "L. Bianchi"];
const FIRST = ["Michael", "Sarah", "David", "Anna", "Omar", "Mei", "Lucas", "Priya", "Tomas", "Layla", "Henrik", "Sofia"];
const LAST = ["Schmidt", "Dubois", "Johnson", "Silva", "Patel", "Yilmaz", "Garcia", "Tanaka", "Novak", "Haddad", "Andersson", "Rossi"];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generateAccounts(count: number): SeedAccount[] {
  const rng = makeRng(20260609);
  const out: SeedAccount[] = [];
  for (let i = 0; i < count; i++) {
    const [country, code, highRisk] = pick(rng, COUNTRIES);
    const numUbos = 1 + Math.floor(rng() * 3);
    const ubos: SeedUbo[] = [];
    // Occasionally plant a sanctioned / PEP owner to create high-risk accounts.
    const plantSanction = rng() < 0.18;
    const plantPep = !plantSanction && rng() < 0.22;
    for (let u = 0; u < numUbos; u++) {
      if (u === 0 && plantSanction) {
        const w = pick(rng, WATCHLIST.filter((e) => e.listSource !== "PEP"));
        ubos.push({ name: w.name, ownershipPct: 20 + Math.floor(rng() * 35), nationality: w.country ?? country, isPep: false });
      } else if (u === 0 && plantPep) {
        const w = pick(rng, WATCHLIST.filter((e) => e.listSource === "PEP"));
        ubos.push({ name: w.name, ownershipPct: 15 + Math.floor(rng() * 30), nationality: w.country ?? country, isPep: true });
      } else {
        ubos.push({
          name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
          ownershipPct: 5 + Math.floor(rng() * 40),
          nationality: country,
          isPep: rng() < 0.05,
          dob: `19${60 + Math.floor(rng() * 30)}-0${1 + Math.floor(rng() * 9)}-1${Math.floor(rng() * 9)}`,
        });
      }
    }

    const adverseMedia = rng() < 0.25 ? 1 + Math.floor(rng() * 2) : 0;
    const litigation = rng() < 0.15;
    // review timing: mix of current / due soon / overdue
    const r = rng();
    const nextOffset = r < 0.18 ? -(5 + Math.floor(rng() * 60)) : r < 0.4 ? 1 + Math.floor(rng() * 28) : 40 + Math.floor(rng() * 320);

    const contextChanges: SeedContextChange[] = [];
    const numCtx = Math.floor(rng() * 3);
    const CTX_TEMPLATES: SeedContextChange[] = [
      { type: "financials", severity: "low", confidence: 79, source: "Audited filings", summary: "Material change in reported leverage ratio.", detectedOffsetDays: 0 },
      { type: "address", severity: "low", confidence: 90, source: "Corporate registry", summary: "Registered office address updated.", detectedOffsetDays: 0, status: "resolved" },
      { type: "media", severity: "medium", confidence: 72, source: "Adverse media scan", summary: "Negative press regarding regulatory compliance.", detectedOffsetDays: 0 },
      { type: "directors", severity: "medium", confidence: 83, source: "Corporate registry", summary: "Board composition changed; new controlling director.", detectedOffsetDays: 0 },
      { type: "industry", severity: "low", confidence: 70, source: "Sector watch", summary: "Sector reclassified following a business-model shift.", detectedOffsetDays: 0, status: "acknowledged" },
    ];
    for (let c = 0; c < numCtx; c++) {
      const t = { ...pick(rng, CTX_TEMPLATES) };
      t.detectedOffsetDays = -(1 + Math.floor(rng() * 88));
      contextChanges.push(t);
    }

    out.push({
      id: `ACC-${12000 + i * 7}`,
      legalName: `${pick(rng, NAME_PREFIX)} ${pick(rng, NAME_SUFFIX)}`,
      industry: pick(rng, INDUSTRIES),
      country,
      jurisdiction: code,
      incorporated: `20${String(Math.floor(rng() * 20)).padStart(2, "0")}-0${1 + Math.floor(rng() * 8)}-15`,
      revenue: `$${50 + Math.floor(rng() * 1950)}M`,
      relationshipManager: pick(rng, RMS),
      accountsHeld: 1 + Math.floor(rng() * 14),
      exposureUSD: (3 + Math.floor(rng() * 240)) * 1_000_000,
      highRiskJurisdiction: highRisk,
      adverseMediaCount: adverseMedia,
      litigationFlag: litigation,
      lastReview: isoOffset(-(120 + Math.floor(rng() * 240))),
      nextReviewOffsetDays: nextOffset,
      ubos,
      contextChanges,
    });
  }
  return out;
}

/* ---------------- seeding ---------------- */

export function seedIfEmpty(db: DatabaseType.Database): void {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM corporate_accounts").get() as { n: number }).n;
  if (count > 0) return;

  const accounts = [...CURATED, ...generateAccounts(30)];
  const today = todayIso();

  const insertWatch = db.prepare(
    "INSERT INTO watchlist_entries (id, name, list_source, program, dob, country) VALUES (@id, @name, @listSource, @program, @dob, @country)",
  );
  const insertAccount = db.prepare(`
    INSERT INTO corporate_accounts
      (id, legal_name, ticker, industry, country, jurisdiction, incorporated, revenue,
       relationship_manager, risk_score, risk_level, kyc_status, last_review, next_review,
       ai_confidence, ubo_count, accounts_held, exposure_usd, high_risk_jurisdiction,
       adverse_media_count, litigation_flag)
    VALUES
      (@id, @legalName, @ticker, @industry, @country, @jurisdiction, @incorporated, @revenue,
       @relationshipManager, @riskScore, @riskLevel, @kycStatus, @lastReview, @nextReview,
       @aiConfidence, @uboCount, @accountsHeld, @exposureUSD, @highRiskJurisdiction,
       @adverseMediaCount, @litigationFlag)
  `);
  const insertUbo = db.prepare(
    "INSERT INTO ubos (id, account_id, name, ownership_pct, nationality, is_pep, dob) VALUES (@id, @accountId, @name, @ownershipPct, @nationality, @isPep, @dob)",
  );
  const insertChange = db.prepare(`
    INSERT INTO detected_changes
      (id, account_id, type, severity, confidence, detected_at, source, summary, before_val, after_val, status)
    VALUES
      (@id, @accountId, @type, @severity, @confidence, @detectedAt, @source, @summary, @before, @after, @status)
  `);

  const run = db.transaction(() => {
    for (const w of WATCHLIST) {
      insertWatch.run({ program: null, dob: null, country: null, ...w });
    }

    for (const acc of accounts) {
      const nextReview = isoOffset(acc.nextReviewOffsetDays);
      const ubos: Ubo[] = acc.ubos.map((u, i) => ({
        id: `${acc.id}-ubo-${i}`,
        accountId: acc.id,
        name: u.name,
        ownershipPct: u.ownershipPct,
        nationality: u.nationality,
        isPep: u.isPep,
        dob: u.dob,
      }));

      const facts: ScreeningAccountFacts = {
        id: acc.id,
        industry: acc.industry,
        jurisdiction: acc.jurisdiction,
        highRiskJurisdiction: acc.highRiskJurisdiction,
        adverseMediaCount: acc.adverseMediaCount,
        litigationFlag: acc.litigationFlag,
        lastReview: acc.lastReview,
        nextReview,
        manualStatus: acc.manualInReview ? "in_review" : undefined,
      };

      const result = screenAccount(facts, ubos, WATCHLIST, today);

      insertAccount.run({
        id: acc.id,
        legalName: acc.legalName,
        ticker: acc.ticker ?? null,
        industry: acc.industry,
        country: acc.country,
        jurisdiction: acc.jurisdiction,
        incorporated: acc.incorporated,
        revenue: acc.revenue,
        relationshipManager: acc.relationshipManager,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        kycStatus: result.kycStatus,
        lastReview: acc.lastReview,
        nextReview,
        aiConfidence: result.aiConfidence,
        uboCount: ubos.length,
        accountsHeld: acc.accountsHeld,
        exposureUSD: acc.exposureUSD,
        highRiskJurisdiction: acc.highRiskJurisdiction ? 1 : 0,
        adverseMediaCount: acc.adverseMediaCount,
        litigationFlag: acc.litigationFlag ? 1 : 0,
      });

      for (const u of ubos) {
        insertUbo.run({ dob: null, ...u, isPep: u.isPep ? 1 : 0 });
      }

      // Engine-generated changes (sanctions / ownership / PEP), detected recently.
      let genIdx = 0;
      for (const g of result.generatedChanges) {
        insertChange.run({
          id: `${acc.id}::${g.dedupeKey}`,
          accountId: acc.id,
          type: g.type,
          severity: g.severity,
          confidence: g.confidence,
          detectedAt: isoOffset(-(genIdx % 7)),
          source: g.source,
          summary: g.summary,
          before: g.before ?? null,
          after: g.after ?? null,
          status: "open",
        });
        genIdx++;
      }

      // Seeded contextual signals (ingested from external sources).
      let ctxIdx = 0;
      for (const c of acc.contextChanges) {
        insertChange.run({
          id: `${acc.id}-ctx-${ctxIdx++}`,
          accountId: acc.id,
          type: c.type,
          severity: c.severity,
          confidence: c.confidence,
          detectedAt: isoOffset(c.detectedOffsetDays),
          source: c.source,
          summary: c.summary,
          before: c.before ?? null,
          after: c.after ?? null,
          status: c.status ?? "open",
        });
      }
    }
  });

  run();
}
