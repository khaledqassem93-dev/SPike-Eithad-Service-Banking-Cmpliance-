export type RiskLevel = "low" | "medium" | "high" | "critical";
export type KycStatus = "current" | "due_soon" | "overdue" | "in_review";
export type ChangeType =
  | "ownership"
  | "directors"
  | "address"
  | "sanctions"
  | "litigation"
  | "financials"
  | "industry"
  | "media";

export interface DetectedChange {
  id: string;
  type: ChangeType;
  severity: RiskLevel;
  confidence: number; // 0-100
  detectedAt: string;
  source: string;
  summary: string;
  before?: string;
  after?: string;
}

export interface CorporateAccount {
  id: string;
  legalName: string;
  ticker?: string;
  industry: string;
  country: string;
  jurisdiction: string;
  incorporated: string;
  revenue: string;
  relationshipManager: string;
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  kycStatus: KycStatus;
  lastReview: string;
  nextReview: string;
  aiConfidence: number;
  changes: DetectedChange[];
  uboCount: number;
  accountsHeld: number;
  exposureUSD: number;
}

const today = new Date();
const d = (offset: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

export const accounts: CorporateAccount[] = [
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
    riskScore: 87,
    riskLevel: "critical",
    kycStatus: "overdue",
    lastReview: "2024-02-11",
    nextReview: d(-21),
    aiConfidence: 94,
    uboCount: 4,
    accountsHeld: 12,
    exposureUSD: 184_300_000,
    changes: [
      {
        id: "ch-1",
        type: "sanctions",
        severity: "critical",
        confidence: 96,
        detectedAt: d(-2),
        source: "OFAC SDN delta feed",
        summary: "New UBO match against OFAC SDN list (87% name + DOB).",
        before: "No sanctioned related parties",
        after: "Beneficial owner Yulia K. — OFAC SDN 2026-05-30",
      },
      {
        id: "ch-2",
        type: "ownership",
        severity: "high",
        confidence: 91,
        detectedAt: d(-6),
        source: "ACRA filing 2026-06-03",
        summary: "Ultimate beneficial owner crossed 25% threshold via SPV transfer.",
        before: "Yulia K. — 18.4%",
        after: "Yulia K. — 31.7% (via Helix SPV)",
      },
      {
        id: "ch-3",
        type: "media",
        severity: "medium",
        confidence: 78,
        detectedAt: d(-1),
        source: "Adverse media scan (Reuters, FT)",
        summary: "3 adverse articles re: customs investigation in EU.",
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
    riskScore: 64,
    riskLevel: "high",
    kycStatus: "due_soon",
    lastReview: "2025-07-22",
    nextReview: d(9),
    aiConfidence: 88,
    uboCount: 2,
    accountsHeld: 5,
    exposureUSD: 42_900_000,
    changes: [
      {
        id: "ch-4",
        type: "directors",
        severity: "medium",
        confidence: 92,
        detectedAt: d(-4),
        source: "BORME registry",
        summary: "Two new directors appointed; one PEP exposure flagged.",
        before: "5 directors",
        after: "7 directors (1 PEP — regional minister, Andalusia)",
      },
      {
        id: "ch-5",
        type: "financials",
        severity: "low",
        confidence: 81,
        detectedAt: d(-8),
        source: "Audited filings",
        summary: "Revenue down 14% YoY, debt covenants approaching threshold.",
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
    riskScore: 28,
    riskLevel: "low",
    kycStatus: "current",
    lastReview: "2026-04-02",
    nextReview: d(312),
    aiConfidence: 97,
    uboCount: 0,
    accountsHeld: 9,
    exposureUSD: 311_400_000,
    changes: [
      {
        id: "ch-6",
        type: "industry",
        severity: "low",
        confidence: 73,
        detectedAt: d(-3),
        source: "FDA bulletin",
        summary: "Class II recall — minor; no AML/KYC impact.",
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
    riskScore: 73,
    riskLevel: "high",
    kycStatus: "in_review",
    lastReview: "2025-12-01",
    nextReview: d(-3),
    aiConfidence: 90,
    uboCount: 6,
    accountsHeld: 18,
    exposureUSD: 96_700_000,
    changes: [
      {
        id: "ch-7",
        type: "ownership",
        severity: "high",
        confidence: 89,
        detectedAt: d(-5),
        source: "LP register update",
        summary: "New LP from high-risk jurisdiction (Russia, 9% commitment).",
      },
      {
        id: "ch-8",
        type: "litigation",
        severity: "medium",
        confidence: 84,
        detectedAt: d(-12),
        source: "PACER",
        summary: "Securities class-action filed in SDNY.",
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
    riskScore: 52,
    riskLevel: "medium",
    kycStatus: "due_soon",
    lastReview: "2025-09-18",
    nextReview: d(22),
    aiConfidence: 82,
    uboCount: 1,
    accountsHeld: 3,
    exposureUSD: 8_400_000,
    changes: [
      {
        id: "ch-9",
        type: "address",
        severity: "low",
        confidence: 95,
        detectedAt: d(-1),
        source: "Postal registry",
        summary: "Registered office moved within Nairobi CBD.",
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
    riskScore: 19,
    riskLevel: "low",
    kycStatus: "current",
    lastReview: "2026-05-12",
    nextReview: d(340),
    aiConfidence: 98,
    uboCount: 0,
    accountsHeld: 6,
    exposureUSD: 67_300_000,
    changes: [],
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
    riskScore: 79,
    riskLevel: "high",
    kycStatus: "overdue",
    lastReview: "2024-11-08",
    nextReview: d(-46),
    aiConfidence: 92,
    uboCount: 3,
    accountsHeld: 7,
    exposureUSD: 54_100_000,
    changes: [
      {
        id: "ch-10",
        type: "sanctions",
        severity: "high",
        confidence: 88,
        detectedAt: d(-7),
        source: "Vessel-tracking AI (AIS dark periods)",
        summary: "Two vessels showed AIS gaps near sanctioned ports.",
      },
      {
        id: "ch-11",
        type: "directors",
        severity: "medium",
        confidence: 85,
        detectedAt: d(-15),
        source: "DMCC registry",
        summary: "Nominee director change — verification pending.",
      },
    ],
  },
];

export const detectionTrend = [
  { day: "Mon", critical: 2, high: 4, medium: 7, low: 11 },
  { day: "Tue", critical: 1, high: 6, medium: 9, low: 14 },
  { day: "Wed", critical: 3, high: 5, medium: 8, low: 12 },
  { day: "Thu", critical: 4, high: 7, medium: 10, low: 9 },
  { day: "Fri", critical: 2, high: 9, medium: 12, low: 16 },
  { day: "Sat", critical: 1, high: 3, medium: 5, low: 8 },
  { day: "Sun", critical: 0, high: 2, medium: 4, low: 6 },
];

export const riskDistribution = [
  { name: "Low", value: 412, color: "var(--success)" },
  { name: "Medium", value: 187, color: "var(--warning)" },
  { name: "High", value: 64, color: "oklch(0.7 0.18 35)" },
  { name: "Critical", value: 19, color: "var(--danger)" },
];
