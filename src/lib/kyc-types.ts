// Shared KYC domain types. Client-safe: no server-only imports here, so both
// the browser bundle and server functions can use these.

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type KycStatus = "current" | "due_soon" | "overdue" | "in_review";
export type ChangeStatus = "open" | "acknowledged" | "resolved";
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
  accountId: string;
  type: ChangeType;
  severity: RiskLevel;
  confidence: number; // 0-100
  detectedAt: string; // ISO date
  source: string;
  summary: string;
  before?: string;
  after?: string;
  status: ChangeStatus;
}

export interface Ubo {
  id: string;
  accountId: string;
  name: string;
  ownershipPct: number;
  nationality: string;
  isPep: boolean;
  dob?: string;
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
  riskScore: number; // 0-100 (computed by the screening engine)
  riskLevel: RiskLevel; // computed
  kycStatus: KycStatus;
  lastReview: string;
  nextReview: string;
  aiConfidence: number;
  uboCount: number;
  accountsHeld: number;
  exposureUSD: number;
  changes: DetectedChange[];
}

export interface DashboardStats {
  totalChanges: number; // open changes in the last 7 days
  critical: number; // accounts at critical risk
  overdue: number; // accounts overdue for KYC
  exposure: number; // total monitored exposure (USD)
  monitoredAccounts: number; // total accounts under monitoring
  sourcesMonitored: number; // distinct change sources
  lastSync: string; // ISO timestamp of most recent detection
}

export interface TrendPoint {
  day: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RiskSlice {
  name: string;
  value: number;
  level: RiskLevel;
}

export interface AiInsight {
  tone: "danger" | "warning" | "info";
  icon: "sanctions" | "ownership" | "media";
  text: string;
}

export interface LiveFeedItem {
  changeId: string;
  accountId: string;
  legalName: string;
  type: ChangeType;
  severity: RiskLevel;
  confidence: number;
  detectedAt: string;
  summary: string;
}

export interface ReviewQueueItem {
  id: string;
  legalName: string;
  kycStatus: KycStatus;
  nextReview: string;
  relationshipManager: string;
}

export interface DetectionRow {
  id: string;
  accountId: string;
  legalName: string;
  type: ChangeType;
  severity: RiskLevel;
  confidence: number;
  detectedAt: string;
  source: string;
  summary: string;
  status: ChangeStatus;
}

export interface ReviewRow {
  id: string;
  legalName: string;
  industry: string;
  country: string;
  riskScore: number;
  riskLevel: RiskLevel;
  kycStatus: KycStatus;
  lastReview: string;
  nextReview: string;
  relationshipManager: string;
  openChanges: number;
}

export interface AppSettings {
  matchThreshold: number;
  ownershipThreshold: number;
  dueSoonDays: number;
  autoEscalateCritical: boolean;
  officerName: string;
  orgName: string;
  aiModel: string;
  aiConfigured: boolean; // whether a Cowork Compliance API key is stored (key never sent to client)
  scanDirectory: string; // default directory for the daily automated QR batch scan
}

/* ---------------- Cowork Compliance AI agent ---------------- */

export type CompliancePriority = "immediate" | "high" | "routine";

export interface ComplianceAction {
  title: string;
  detail: string;
  cbjReference: string; // Central Bank of Jordan instruction area this action maps to
  priority: CompliancePriority;
}

export interface ComplianceAdvice {
  caseSummary: string;
  overallRiskRating: RiskLevel;
  filingRequired: boolean; // whether an STR to the AMLU (Jordan FIU) is warranted
  recommendedActions: ComplianceAction[];
  disclaimer: string;
  model: string;
  generatedAt: string;
}

export interface SourceFeed {
  name: string;
  category: "sanctions" | "registry" | "media" | "other";
  detections: number;
  open: number;
  lastDetected: string | null;
}

export interface SourcesData {
  feeds: SourceFeed[];
  watchlists: Array<{ listSource: string; entries: number }>;
  totals: { feeds: number; watchlistEntries: number; detections: number };
}

export type TrendWindow = "7d" | "30d" | "90d";

export const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
