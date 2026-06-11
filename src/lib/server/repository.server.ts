import type {
  AiInsight,
  AppSettings,
  ChangeStatus,
  ChangeType,
  ComplianceAdvice,
  CorporateAccount,
  DashboardStats,
  DetectedChange,
  DetectionRow,
  LiveFeedItem,
  ReviewQueueItem,
  ReviewRow,
  RiskLevel,
  RiskSlice,
  SourceFeed,
  SourcesData,
  TrendPoint,
  TrendWindow,
  Ubo,
} from "../kyc-types";
import { RISK_LEVELS } from "../kyc-types";
import { getDb } from "./db.server";
import { generateComplianceAdvice } from "./compliance-agent.server";
import {
  DEFAULT_SCREENING_CONFIG,
  screenAccount,
  type ScreeningAccountFacts,
  type ScreeningConfig,
  type WatchlistEntry,
} from "./screening.server";

// All database access lives here and returns domain objects (camelCase).
// Server functions in lib/api/kyc.functions.ts call these; no SQL leaks out.

/* ---------------- row mappers ---------------- */

type AccountRow = {
  id: string;
  legal_name: string;
  ticker: string | null;
  industry: string;
  country: string;
  jurisdiction: string;
  incorporated: string;
  revenue: string;
  relationship_manager: string;
  risk_score: number;
  risk_level: RiskLevel;
  kyc_status: CorporateAccount["kycStatus"];
  last_review: string;
  next_review: string;
  ai_confidence: number;
  ubo_count: number;
  accounts_held: number;
  exposure_usd: number;
  high_risk_jurisdiction: number;
  adverse_media_count: number;
  litigation_flag: number;
};

type ChangeRow = {
  id: string;
  account_id: string;
  type: DetectedChange["type"];
  severity: RiskLevel;
  confidence: number;
  detected_at: string;
  source: string;
  summary: string;
  before_val: string | null;
  after_val: string | null;
  status: DetectedChange["status"];
};

function mapAccount(row: AccountRow, changes: DetectedChange[]): CorporateAccount {
  return {
    id: row.id,
    legalName: row.legal_name,
    ticker: row.ticker ?? undefined,
    industry: row.industry,
    country: row.country,
    jurisdiction: row.jurisdiction,
    incorporated: row.incorporated,
    revenue: row.revenue,
    relationshipManager: row.relationship_manager,
    riskScore: row.risk_score,
    riskLevel: row.risk_level,
    kycStatus: row.kyc_status,
    lastReview: row.last_review,
    nextReview: row.next_review,
    aiConfidence: row.ai_confidence,
    uboCount: row.ubo_count,
    accountsHeld: row.accounts_held,
    exposureUSD: row.exposure_usd,
    changes,
  };
}

function mapChange(row: ChangeRow): DetectedChange {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    severity: row.severity,
    confidence: row.confidence,
    detectedAt: row.detected_at,
    source: row.source,
    summary: row.summary,
    before: row.before_val ?? undefined,
    after: row.after_val ?? undefined,
    status: row.status,
  };
}

function changesForAccounts(ids: string[]): Map<string, DetectedChange[]> {
  const map = new Map<string, DetectedChange[]>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM detected_changes WHERE account_id IN (${placeholders}) ORDER BY detected_at DESC`,
    )
    .all(...ids) as ChangeRow[];
  for (const r of rows) {
    const list = map.get(r.account_id) ?? [];
    list.push(mapChange(r));
    map.set(r.account_id, list);
  }
  return map;
}

/* ---------------- queries ---------------- */

export function listAccounts(opts: {
  query?: string;
  riskFilter?: RiskLevel | "all";
  sort?: "risk" | "exposure" | "review";
}): CorporateAccount[] {
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (opts.query && opts.query.trim()) {
    where.push("(LOWER(legal_name) LIKE @q OR LOWER(id) LIKE @q OR LOWER(industry) LIKE @q)");
    params.q = `%${opts.query.trim().toLowerCase()}%`;
  }
  if (opts.riskFilter && opts.riskFilter !== "all") {
    where.push("risk_level = @risk");
    params.risk = opts.riskFilter;
  }

  const orderBy =
    opts.sort === "exposure"
      ? "exposure_usd DESC"
      : opts.sort === "review"
        ? "next_review ASC"
        : "risk_score DESC";

  const rows = db
    .prepare(
      `SELECT * FROM corporate_accounts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${orderBy}`,
    )
    .all(params) as AccountRow[];

  const changeMap = changesForAccounts(rows.map((r) => r.id));
  return rows.map((r) => mapAccount(r, changeMap.get(r.id) ?? []));
}

export function getAccount(id: string): (CorporateAccount & { ubos: Ubo[] }) | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM corporate_accounts WHERE id = ?").get(id) as
    | AccountRow
    | undefined;
  if (!row) return null;
  const changes = changesForAccounts([id]).get(id) ?? [];
  const uboRows = db.prepare("SELECT * FROM ubos WHERE account_id = ?").all(id) as Array<{
    id: string;
    account_id: string;
    name: string;
    ownership_pct: number;
    nationality: string;
    is_pep: number;
    dob: string | null;
  }>;
  const ubos: Ubo[] = uboRows.map((u) => ({
    id: u.id,
    accountId: u.account_id,
    name: u.name,
    ownershipPct: u.ownership_pct,
    nationality: u.nationality,
    isPep: !!u.is_pep,
    dob: u.dob ?? undefined,
  }));
  return { ...mapAccount(row, changes), ubos };
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const totalChanges = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM detected_changes WHERE status = 'open' AND detected_at >= date('now', '-7 days')",
      )
      .get() as { n: number }
  ).n;
  const critical = (
    db.prepare("SELECT COUNT(*) AS n FROM corporate_accounts WHERE risk_level = 'critical'").get() as {
      n: number;
    }
  ).n;
  const overdue = (
    db.prepare("SELECT COUNT(*) AS n FROM corporate_accounts WHERE kyc_status = 'overdue'").get() as {
      n: number;
    }
  ).n;
  const agg = db
    .prepare("SELECT COALESCE(SUM(exposure_usd),0) AS exp, COUNT(*) AS n FROM corporate_accounts")
    .get() as { exp: number; n: number };
  const sources = (
    db.prepare("SELECT COUNT(DISTINCT source) AS n FROM detected_changes").get() as { n: number }
  ).n;
  const lastSync =
    (db.prepare("SELECT MAX(detected_at) AS d FROM detected_changes").get() as { d: string | null })
      .d ?? new Date().toISOString().slice(0, 10);

  return {
    totalChanges,
    critical,
    overdue,
    exposure: agg.exp,
    monitoredAccounts: agg.n,
    sourcesMonitored: sources,
    lastSync,
  };
}

export function getDetectionTrend(window: TrendWindow): TrendPoint[] {
  const db = getDb();
  const days = window === "7d" ? 7 : window === "30d" ? 30 : 90;
  const rows = db
    .prepare(
      `SELECT detected_at, severity FROM detected_changes WHERE detected_at >= date('now', ?)`,
    )
    .all(`-${days - 1} days`) as Array<{ detected_at: string; severity: RiskLevel }>;

  const buckets = new Map<string, TrendPoint>();
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = days === 7 ? weekday[d.getUTCDay()] : iso.slice(5); // MM-DD for longer windows
    const point: TrendPoint = { day: label, critical: 0, high: 0, medium: 0, low: 0 };
    buckets.set(iso, point);
    points.push(point);
  }
  for (const r of rows) {
    const p = buckets.get(r.detected_at);
    if (p) p[r.severity] += 1;
  }
  return points;
}

export function getRiskDistribution(): RiskSlice[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT risk_level AS level, COUNT(*) AS n FROM corporate_accounts GROUP BY risk_level")
    .all() as Array<{ level: RiskLevel; n: number }>;
  const counts = new Map(rows.map((r) => [r.level, r.n]));
  const label: Record<RiskLevel, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
  };
  return RISK_LEVELS.map((level) => ({ name: label[level], level, value: counts.get(level) ?? 0 }));
}

export function getLiveFeed(limit = 12): LiveFeedItem[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id AS changeId, c.account_id AS accountId, a.legal_name AS legalName,
              c.type, c.severity, c.confidence, c.detected_at AS detectedAt, c.summary
       FROM detected_changes c
       JOIN corporate_accounts a ON a.id = c.account_id
       ORDER BY c.detected_at DESC, c.id DESC
       LIMIT ?`,
    )
    .all(limit) as LiveFeedItem[];
  return rows;
}

export function getReviewQueue(): ReviewQueueItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, legal_name AS legalName, kyc_status AS kycStatus, next_review AS nextReview,
              relationship_manager AS relationshipManager
       FROM corporate_accounts
       WHERE kyc_status != 'current'
       ORDER BY next_review ASC`,
    )
    .all() as ReviewQueueItem[];
  return rows;
}

export function getAiInsights(): AiInsight[] {
  const db = getDb();
  const sanctionsAccounts = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT account_id) AS n FROM detected_changes WHERE type = 'sanctions' AND status != 'resolved'",
      )
      .get() as { n: number }
  ).n;
  const ownershipBreaches = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM ubos WHERE ownership_pct >= 25",
      )
      .get() as { n: number }
  ).n;
  const mediaAccounts = (
    db.prepare("SELECT COUNT(*) AS n FROM corporate_accounts WHERE adverse_media_count > 0").get() as {
      n: number;
    }
  ).n;

  return [
    {
      tone: "danger",
      icon: "sanctions",
      text: `${sanctionsAccounts} account${sanctionsAccounts === 1 ? "" : "s"} carry open sanctions/watchlist matches across beneficial owners.`,
    },
    {
      tone: "warning",
      icon: "ownership",
      text: `${ownershipBreaches} beneficial owner${ownershipBreaches === 1 ? "" : "s"} sit at or above the 25% disclosure threshold — refresh required.`,
    },
    {
      tone: "info",
      icon: "media",
      text: `Adverse media signals are active on ${mediaAccounts} account${mediaAccounts === 1 ? "" : "s"} under watch.`,
    },
  ];
}

/* ---------------- mutations ---------------- */

function logAudit(accountId: string | null, action: string, detail?: string): void {
  getDb()
    .prepare("INSERT INTO audit_events (account_id, action, detail) VALUES (?, ?, ?)")
    .run(accountId, action, detail ?? null);
}

function touchAccount(id: string): void {
  getDb().prepare("UPDATE corporate_accounts SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function startKycRefresh(accountId: string): CorporateAccount | null {
  const db = getDb();
  const res = db
    .prepare("UPDATE corporate_accounts SET kyc_status = 'in_review', updated_at = datetime('now') WHERE id = ?")
    .run(accountId);
  if (res.changes === 0) return null;
  logAudit(accountId, "kyc_refresh_started", "KYC refresh opened by compliance officer");
  return getAccount(accountId);
}

export function escalateAccount(accountId: string, note?: string): CorporateAccount | null {
  const exists = getDb().prepare("SELECT 1 FROM corporate_accounts WHERE id = ?").get(accountId);
  if (!exists) return null;
  logAudit(accountId, "escalated", note ?? "Escalated to enhanced due diligence");
  touchAccount(accountId);
  return getAccount(accountId);
}

export function acknowledgeChange(changeId: string): DetectedChange | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM detected_changes WHERE id = ?").get(changeId) as
    | ChangeRow
    | undefined;
  if (!row) return null;
  db.prepare("UPDATE detected_changes SET status = 'acknowledged' WHERE id = ?").run(changeId);
  logAudit(row.account_id, "change_acknowledged", `${row.type} change acknowledged`);
  const updated = db.prepare("SELECT * FROM detected_changes WHERE id = ?").get(changeId) as ChangeRow;
  return mapChange(updated);
}

export function startTriage(): { queued: number; accounts: CorporateAccount[] } {
  const accounts = listAccounts({ sort: "risk" }).filter(
    (a) => a.riskLevel === "critical" || a.kycStatus === "overdue",
  );
  logAudit(null, "triage_started", `Triage started for ${accounts.length} priority accounts`);
  return { queued: accounts.length, accounts };
}

export function runScreening(accountId: string): (CorporateAccount & { ubos: Ubo[] }) | null {
  const db = getDb();
  const acc = getAccount(accountId);
  if (!acc) return null;

  const watchlist = db.prepare("SELECT id, name, list_source AS listSource, program, dob, country FROM watchlist_entries").all() as WatchlistEntry[];
  const facts: ScreeningAccountFacts = {
    id: acc.id,
    industry: acc.industry,
    jurisdiction: acc.jurisdiction,
    highRiskJurisdiction: !!(db.prepare("SELECT high_risk_jurisdiction AS h FROM corporate_accounts WHERE id = ?").get(accountId) as { h: number }).h,
    adverseMediaCount: (db.prepare("SELECT adverse_media_count AS a FROM corporate_accounts WHERE id = ?").get(accountId) as { a: number }).a,
    litigationFlag: !!(db.prepare("SELECT litigation_flag AS l FROM corporate_accounts WHERE id = ?").get(accountId) as { l: number }).l,
    lastReview: acc.lastReview,
    nextReview: acc.nextReview,
    manualStatus: acc.kycStatus === "in_review" ? "in_review" : undefined,
  };

  const result = screenAccount(
    facts,
    acc.ubos,
    watchlist,
    new Date().toISOString().slice(0, 10),
    getScreeningConfig(),
  );

  const upsert = db.prepare(`
    INSERT INTO detected_changes (id, account_id, type, severity, confidence, detected_at, source, summary, before_val, after_val, status)
    VALUES (@id, @accountId, @type, @severity, @confidence, @detectedAt, @source, @summary, @before, @after, 'open')
    ON CONFLICT(id) DO UPDATE SET
      severity = excluded.severity,
      confidence = excluded.confidence,
      summary = excluded.summary,
      after_val = excluded.after_val
  `);

  const tx = db.transaction(() => {
    const today = new Date().toISOString().slice(0, 10);
    for (const g of result.generatedChanges) {
      upsert.run({
        id: `${accountId}::${g.dedupeKey}`,
        accountId,
        type: g.type,
        severity: g.severity,
        confidence: g.confidence,
        detectedAt: today,
        source: g.source,
        summary: g.summary,
        before: g.before ?? null,
        after: g.after ?? null,
      });
    }
    db.prepare(
      "UPDATE corporate_accounts SET risk_score = ?, risk_level = ?, kyc_status = ?, ai_confidence = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(result.riskScore, result.riskLevel, result.kycStatus, result.aiConfidence, accountId);
  });
  tx();
  logAudit(accountId, "screening_run", `Re-screened: ${result.generatedChanges.length} findings, risk ${result.riskScore}`);

  return getAccount(accountId) as CorporateAccount & { ubos: Ubo[] };
}

/* ---------------- detections / alerts ---------------- */

const DETECTION_SELECT = `
  SELECT c.id, c.account_id AS accountId, a.legal_name AS legalName, c.type, c.severity,
         c.confidence, c.detected_at AS detectedAt, c.source, c.summary, c.status
  FROM detected_changes c
  JOIN corporate_accounts a ON a.id = c.account_id
`;

export function listDetections(opts: {
  type?: ChangeType | "all";
  severity?: RiskLevel | "all";
  status?: ChangeStatus | "all";
  window?: TrendWindow | "all";
  query?: string;
}): DetectionRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.type && opts.type !== "all") {
    where.push("c.type = @type");
    params.type = opts.type;
  }
  if (opts.severity && opts.severity !== "all") {
    where.push("c.severity = @sev");
    params.sev = opts.severity;
  }
  if (opts.status && opts.status !== "all") {
    where.push("c.status = @st");
    params.st = opts.status;
  }
  if (opts.window && opts.window !== "all") {
    const days = opts.window === "7d" ? 7 : opts.window === "30d" ? 30 : 90;
    where.push("c.detected_at >= date('now', @win)");
    params.win = `-${days - 1} days`;
  }
  if (opts.query && opts.query.trim()) {
    where.push("(LOWER(a.legal_name) LIKE @q OR LOWER(c.summary) LIKE @q OR LOWER(c.source) LIKE @q)");
    params.q = `%${opts.query.trim().toLowerCase()}%`;
  }
  const sql = `${DETECTION_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.detected_at DESC, c.id DESC`;
  return getDb().prepare(sql).all(params) as DetectionRow[];
}

export function listAlerts(
  opts: { severity?: RiskLevel | "all"; status?: ChangeStatus | "all" } = {},
): DetectionRow[] {
  // Alerts = elevated, actionable detections (high/critical severity OR any
  // sanctions match), defaulting to those not yet resolved.
  const where: string[] = ["(c.severity IN ('high','critical') OR c.type = 'sanctions')"];
  const params: Record<string, unknown> = {};
  if (opts.severity && opts.severity !== "all") {
    where.push("c.severity = @sev");
    params.sev = opts.severity;
  }
  if (opts.status && opts.status !== "all") {
    where.push("c.status = @st");
    params.st = opts.status;
  } else {
    where.push("c.status != 'resolved'");
  }
  const sql = `${DETECTION_SELECT} WHERE ${where.join(" AND ")} ORDER BY
    CASE c.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    c.detected_at DESC`;
  return getDb().prepare(sql).all(params) as DetectionRow[];
}

export function resolveChange(changeId: string): DetectedChange | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM detected_changes WHERE id = ?").get(changeId) as
    | ChangeRow
    | undefined;
  if (!row) return null;
  db.prepare("UPDATE detected_changes SET status = 'resolved' WHERE id = ?").run(changeId);
  logAudit(row.account_id, "change_resolved", `${row.type} change resolved`);
  return mapChange(db.prepare("SELECT * FROM detected_changes WHERE id = ?").get(changeId) as ChangeRow);
}

/* ---------------- reviews ---------------- */

export function listReviews(): ReviewRow[] {
  return getDb()
    .prepare(
      `SELECT a.id, a.legal_name AS legalName, a.industry, a.country, a.risk_score AS riskScore,
              a.risk_level AS riskLevel, a.kyc_status AS kycStatus, a.last_review AS lastReview,
              a.next_review AS nextReview, a.relationship_manager AS relationshipManager,
              (SELECT COUNT(*) FROM detected_changes c WHERE c.account_id = a.id AND c.status = 'open') AS openChanges
       FROM corporate_accounts a
       WHERE a.kyc_status != 'current'
       ORDER BY CASE a.kyc_status WHEN 'overdue' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, a.next_review ASC`,
    )
    .all() as ReviewRow[];
}

export function completeKycReview(accountId: string): CorporateAccount | null {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM corporate_accounts WHERE id = ?").get(accountId);
  if (!exists) return null;
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date();
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  const nextIso = next.toISOString().slice(0, 10);
  db.prepare(
    "UPDATE corporate_accounts SET last_review = ?, next_review = ?, kyc_status = 'current', updated_at = datetime('now') WHERE id = ?",
  ).run(today, nextIso, accountId);
  logAudit(accountId, "kyc_review_completed", `KYC pack refreshed; next review ${nextIso}`);
  return getAccount(accountId);
}

/* ---------------- sources ---------------- */

export function getSources(): SourcesData {
  const db = getDb();
  const feedRows = db
    .prepare(
      `SELECT source AS name, COUNT(*) AS detections,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
              MAX(detected_at) AS lastDetected
       FROM detected_changes GROUP BY source ORDER BY detections DESC`,
    )
    .all() as Array<{ name: string; detections: number; open: number | null; lastDetected: string | null }>;

  const categorize = (name: string): SourceFeed["category"] => {
    const n = name.toLowerCase();
    if (/ofac|un |eu|sanction|pep|watchlist|sdn|ais|vessel/.test(n)) return "sanctions";
    if (/registry|register|filing|borme|acra|dmcc|pacer|court/.test(n)) return "registry";
    if (/media|press|news|reuters|ft\b/.test(n)) return "media";
    return "other";
  };
  const feeds: SourceFeed[] = feedRows.map((r) => ({
    name: r.name,
    category: categorize(r.name),
    detections: r.detections,
    open: r.open ?? 0,
    lastDetected: r.lastDetected,
  }));

  const watchlists = db
    .prepare(
      "SELECT list_source AS listSource, COUNT(*) AS entries FROM watchlist_entries GROUP BY list_source ORDER BY entries DESC",
    )
    .all() as Array<{ listSource: string; entries: number }>;

  const wlTotal = (db.prepare("SELECT COUNT(*) AS n FROM watchlist_entries").get() as { n: number }).n;
  const detTotal = (db.prepare("SELECT COUNT(*) AS n FROM detected_changes").get() as { n: number }).n;

  return { feeds, watchlists, totals: { feeds: feeds.length, watchlistEntries: wlTotal, detections: detTotal } };
}

/* ---------------- settings ---------------- */

type SettingsRow = {
  match_threshold: number;
  ownership_threshold: number;
  due_soon_days: number;
  auto_escalate_critical: number;
  officer_name: string;
  org_name: string;
  ai_provider: string;
  ai_api_key: string;
  ai_model: string;
  scan_directory: string;
};

export function getSettings(): AppSettings {
  const row = getDb().prepare("SELECT * FROM app_settings WHERE id = 1").get() as
    | SettingsRow
    | undefined;
  if (!row) {
    return {
      matchThreshold: DEFAULT_SCREENING_CONFIG.matchThreshold,
      ownershipThreshold: DEFAULT_SCREENING_CONFIG.ownershipThreshold,
      dueSoonDays: DEFAULT_SCREENING_CONFIG.dueSoonDays,
      autoEscalateCritical: true,
      officerName: "A. Okafor",
      orgName: "Bank al Etihad",
      aiModel: "claude-opus-4-8",
      aiConfigured: false,
      scanDirectory: "",
    };
  }
  return {
    matchThreshold: row.match_threshold,
    ownershipThreshold: row.ownership_threshold,
    dueSoonDays: row.due_soon_days,
    autoEscalateCritical: !!row.auto_escalate_critical,
    officerName: row.officer_name,
    orgName: row.org_name,
    aiModel: row.ai_model || "claude-opus-4-8",
    // Only a boolean leaves the server — the raw key is never sent to the client.
    aiConfigured: !!(row.ai_api_key && row.ai_api_key.length > 0),
    scanDirectory: row.scan_directory ?? "",
  };
}

/** Server-only: the raw API key + model for the Cowork Compliance agent. Never expose via a query. */
export function getAiConfig(): { apiKey: string; model: string } {
  const row = getDb()
    .prepare("SELECT ai_api_key AS k, ai_model AS m FROM app_settings WHERE id = 1")
    .get() as { k: string; m: string } | undefined;
  return { apiKey: row?.k ?? "", model: row?.m || "claude-opus-4-8" };
}

export function getScreeningConfig(): ScreeningConfig {
  const s = getSettings();
  return {
    matchThreshold: s.matchThreshold,
    ownershipThreshold: s.ownershipThreshold,
    dueSoonDays: s.dueSoonDays,
  };
}

export function updateSettings(patch: Partial<AppSettings> & { aiApiKey?: string }): AppSettings {
  const db = getDb();
  const next: AppSettings = { ...getSettings(), ...patch };
  // Clamp to sane operating ranges.
  next.matchThreshold = Math.min(0.99, Math.max(0.5, next.matchThreshold));
  next.ownershipThreshold = Math.min(75, Math.max(5, next.ownershipThreshold));
  next.dueSoonDays = Math.min(180, Math.max(7, Math.round(next.dueSoonDays)));
  const aiModel = next.aiModel || "claude-opus-4-8";
  db.prepare(
    `UPDATE app_settings SET match_threshold = @matchThreshold, ownership_threshold = @ownershipThreshold,
       due_soon_days = @dueSoonDays, auto_escalate_critical = @autoEscalate, officer_name = @officerName,
       org_name = @orgName, ai_model = @aiModel, scan_directory = @scanDirectory,
       updated_at = datetime('now') WHERE id = 1`,
  ).run({
    matchThreshold: next.matchThreshold,
    ownershipThreshold: next.ownershipThreshold,
    dueSoonDays: next.dueSoonDays,
    autoEscalate: next.autoEscalateCritical ? 1 : 0,
    officerName: next.officerName,
    orgName: next.orgName,
    aiModel,
    scanDirectory: next.scanDirectory ?? "",
  });
  // Only overwrite the key when a non-empty new value is supplied (so saving
  // other settings doesn't wipe the stored key).
  const keyUpdated = typeof patch.aiApiKey === "string" && patch.aiApiKey.trim().length > 0;
  if (keyUpdated) {
    db.prepare("UPDATE app_settings SET ai_api_key = @k WHERE id = 1").run({ k: patch.aiApiKey!.trim() });
  }
  logAudit(
    null,
    "settings_updated",
    `Config updated (match ${next.matchThreshold}, ownership ${next.ownershipThreshold}%, due-soon ${next.dueSoonDays}d, AI ${aiModel}${keyUpdated ? ", API key set" : ""})`,
  );
  return getSettings();
}

/* ---------------- Cowork Compliance agent ---------------- */

export async function adviseCase(accountId: string): Promise<ComplianceAdvice | null> {
  const db = getDb();
  const account = getAccount(accountId);
  if (!account) return null;

  const facts = db
    .prepare(
      "SELECT high_risk_jurisdiction AS h, adverse_media_count AS a, litigation_flag AS l FROM corporate_accounts WHERE id = ?",
    )
    .get(accountId) as { h: number; a: number; l: number };

  const advice = await generateComplianceAdvice(
    {
      account,
      highRiskJurisdiction: !!facts.h,
      adverseMediaCount: facts.a,
      litigationFlag: !!facts.l,
    },
    getAiConfig(),
  );

  logAudit(
    accountId,
    "ai_guidance_generated",
    `Cowork Compliance guidance (${advice.model}): ${advice.recommendedActions.length} actions, STR filing ${advice.filingRequired ? "recommended" : "not recommended"}`,
  );
  return advice;
}

export function rescreenAll(): { count: number; distribution: RiskSlice[] } {
  const ids = getDb().prepare("SELECT id FROM corporate_accounts").all() as Array<{ id: string }>;
  for (const { id } of ids) runScreening(id);
  logAudit(null, "rescreen_all", `Re-screened ${ids.length} accounts with current settings`);
  return { count: ids.length, distribution: getRiskDistribution() };
}
