import type {
  ChangeType,
  KycStatus,
  RiskLevel,
  Ubo,
} from "../kyc-types";

// Deterministic KYC screening engine. Pure functions only (no DB, no I/O) so
// the logic is unit-testable and reproducible. This is the real replacement
// for the dashboard's former hardcoded "AI detected …" strings: every change,
// risk score and KYC status below is *computed* from account facts.

export interface WatchlistEntry {
  id: string;
  name: string;
  listSource: string; // "OFAC SDN" | "UN Consolidated" | "EU" | "PEP"
  program?: string;
  dob?: string;
  country?: string;
}

export interface ScreeningAccountFacts {
  id: string;
  industry: string;
  jurisdiction: string;
  highRiskJurisdiction: boolean;
  adverseMediaCount: number;
  litigationFlag: boolean;
  lastReview: string;
  nextReview: string;
  manualStatus?: KycStatus; // "in_review" when an officer has opened a refresh
}

export interface GeneratedChange {
  dedupeKey: string;
  type: ChangeType;
  severity: RiskLevel;
  confidence: number;
  source: string;
  summary: string;
  before?: string;
  after?: string;
}

export interface ScreeningResult {
  riskScore: number;
  riskLevel: RiskLevel;
  kycStatus: KycStatus;
  aiConfidence: number;
  generatedChanges: GeneratedChange[];
}

const SANCTIONS_LISTS = new Set(["OFAC SDN", "UN Consolidated", "EU"]);

export interface ScreeningConfig {
  matchThreshold: number; // 0..1 name-similarity cutoff for a watchlist hit
  ownershipThreshold: number; // % ownership that triggers a UBO disclosure change
  dueSoonDays: number; // review window (days) before a KYC review counts as "due soon"
}

export const DEFAULT_SCREENING_CONFIG: ScreeningConfig = {
  matchThreshold: 0.85,
  ownershipThreshold: 25,
  dueSoonDays: 30,
};

/* ---------------- name matching ---------------- */

function normalize(input: string): string[] {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function tokenSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Average best-token similarity of the shorter token set against the longer. 0..1. */
export function nameMatchScore(a: string, b: string): number {
  const A = normalize(a);
  const B = normalize(b);
  if (!A.length || !B.length) return 0;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  let sum = 0;
  for (const t of short) {
    let best = 0;
    for (const u of long) best = Math.max(best, tokenSimilarity(t, u));
    sum += best;
  }
  return sum / short.length;
}

/* ---------------- KYC status ---------------- */

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((to - from) / 86_400_000);
}

export function computeKycStatus(
  facts: ScreeningAccountFacts,
  today: string,
  dueSoonDays = DEFAULT_SCREENING_CONFIG.dueSoonDays,
): KycStatus {
  if (facts.manualStatus === "in_review") return "in_review";
  const dUntil = daysBetween(today, facts.nextReview);
  if (dUntil < 0) return "overdue";
  if (dUntil <= dueSoonDays) return "due_soon";
  return "current";
}

/* ---------------- main engine ---------------- */

export function screenAccount(
  facts: ScreeningAccountFacts,
  ubos: Ubo[],
  watchlist: WatchlistEntry[],
  today: string,
  config: ScreeningConfig = DEFAULT_SCREENING_CONFIG,
): ScreeningResult {
  const changes: GeneratedChange[] = [];

  // 1. Sanctions / watchlist screening of every beneficial owner.
  let sanctionsCritical = false;
  let sanctionsHigh = false;
  const matchConfidences: number[] = [];
  for (const ubo of ubos) {
    for (const entry of watchlist) {
      const score = nameMatchScore(ubo.name, entry.name);
      if (score >= config.matchThreshold) {
        const isHardSanction = SANCTIONS_LISTS.has(entry.listSource);
        const severity: RiskLevel = isHardSanction ? "critical" : "high";
        if (isHardSanction) sanctionsCritical = true;
        else sanctionsHigh = true;
        const confidence = Math.round(score * 100);
        matchConfidences.push(confidence);
        changes.push({
          dedupeKey: `sanctions:${ubo.id}:${entry.id}`,
          type: "sanctions",
          severity,
          confidence,
          source: `${entry.listSource} delta feed`,
          summary: `Beneficial owner "${ubo.name}" matches ${entry.listSource}${
            entry.program ? ` (${entry.program})` : ""
          } at ${confidence}% name similarity.`,
          before: "No sanctioned related parties on file",
          after: `${entry.name}${entry.country ? ` · ${entry.country}` : ""} — ${entry.listSource}`,
        });
      }
    }
  }

  // 2. Ownership threshold breaches (UBO ≥ 25%).
  let ownershipBreach = false;
  for (const ubo of ubos) {
    if (ubo.ownershipPct >= config.ownershipThreshold) {
      ownershipBreach = true;
      changes.push({
        dedupeKey: `ownership:${ubo.id}`,
        type: "ownership",
        severity: ubo.ownershipPct >= 50 ? "high" : "medium",
        confidence: 91,
        source: "Beneficial ownership register",
        summary: `${ubo.name} holds ${ubo.ownershipPct.toFixed(
          1,
        )}% — at or above the ${config.ownershipThreshold}% UBO disclosure threshold.`,
        before: "Below 25% disclosure threshold",
        after: `${ubo.name} — ${ubo.ownershipPct.toFixed(1)}%`,
      });
    }
  }

  // 3. Politically-exposed persons among the owners.
  const pep = ubos.find((u) => u.isPep);
  if (pep) {
    changes.push({
      dedupeKey: `pep:${pep.id}`,
      type: "directors",
      severity: "medium",
      confidence: 88,
      source: "PEP screening",
      summary: `Politically-exposed person identified among beneficial owners: ${pep.name} (${pep.nationality}).`,
    });
  }

  // 4. KYC review status.
  const kycStatus = computeKycStatus(facts, today, config.dueSoonDays);

  // 5. Weighted risk score (0..100).
  let score = 8;
  if (sanctionsCritical) score += 40;
  if (sanctionsHigh) score += 25;
  if (pep) score += 15;
  if (ownershipBreach) score += 15;
  if (facts.highRiskJurisdiction) score += 15;
  score += Math.min(facts.adverseMediaCount * 4, 12);
  if (facts.litigationFlag) score += 8;
  if (kycStatus === "overdue") score += 10;
  else if (kycStatus === "due_soon") score += 4;
  score = Math.max(0, Math.min(100, score));

  const riskLevel: RiskLevel =
    score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low";

  // 6. AI confidence: data completeness blended with match certainty.
  let confidence = ubos.length > 0 ? 90 : 72;
  if (ubos.length > 0 && ubos.every((u) => u.dob)) confidence += 5;
  if (matchConfidences.some((c) => c < 90)) confidence -= 8; // fuzzy matches lower certainty
  const aiConfidence = Math.max(60, Math.min(99, confidence));

  return { riskScore: score, riskLevel, kycStatus, aiConfidence, generatedChanges: changes };
}
