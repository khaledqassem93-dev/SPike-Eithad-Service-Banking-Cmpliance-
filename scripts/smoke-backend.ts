/* End-to-end smoke test of the SQLite data layer + screening engine.
   Run with: tsx scripts/smoke-backend.ts  (uses a throwaway DB). */
import fs from "node:fs";

process.env.KYC_DB_PATH = "/tmp/kyc-smoke.db";
for (const f of ["/tmp/kyc-smoke.db", "/tmp/kyc-smoke.db-wal", "/tmp/kyc-smoke.db-shm"]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const {
  getDashboardStats,
  listAccounts,
  getDetectionTrend,
  getRiskDistribution,
  getLiveFeed,
  getReviewQueue,
  getAiInsights,
  getAccount,
  startKycRefresh,
  runScreening,
} = await import("../src/lib/server/repository.server.ts");

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok:", msg);
}

const stats = getDashboardStats();
console.log("stats:", stats);
assert(stats.monitoredAccounts >= 40, "≥40 accounts seeded");
assert(stats.exposure > 0, "exposure computed");
assert(stats.sourcesMonitored > 0, "sources counted");

const all = listAccounts({});
assert(all.length === stats.monitoredAccounts, "listAccounts returns all");
const critical = listAccounts({ riskFilter: "critical" });
console.log("critical accounts:", critical.length);
assert(critical.every((a) => a.riskLevel === "critical"), "risk filter works");

const search = listAccounts({ query: "meridian" });
assert(search.some((a) => a.id === "ACC-10293"), "search finds Meridian");

const meridian = getAccount("ACC-10293");
assert(!!meridian, "Meridian found");
assert(meridian!.riskLevel === "critical", "Meridian computed critical (OFAC UBO)");
assert(
  meridian!.changes.some((c) => c.type === "sanctions"),
  "Meridian has a computed sanctions change (Yuliya Kaverina)",
);
console.log("Meridian risk:", meridian!.riskScore, meridian!.riskLevel, "changes:", meridian!.changes.length);

const trend7 = getDetectionTrend("7d");
assert(trend7.length === 7, "7d trend has 7 points");
const trend90 = getDetectionTrend("90d");
assert(trend90.length === 90, "90d trend has 90 points");
const trendTotal = trend90.reduce((s, p) => s + p.critical + p.high + p.medium + p.low, 0);
assert(trendTotal > 0, "trend has real detections");

const dist = getRiskDistribution();
console.log("distribution:", dist.map((d) => `${d.name}=${d.value}`).join(", "));
assert(dist.reduce((s, d) => s + d.value, 0) === stats.monitoredAccounts, "distribution sums to total");

const feed = getLiveFeed();
assert(feed.length > 0 && !!feed[0].legalName, "live feed has joined account names");

const queue = getReviewQueue();
assert(queue.every((q) => q.kycStatus !== "current"), "review queue excludes current");

const insights = getAiInsights();
assert(insights.length === 3, "3 computed insights");
console.log("insights:", insights.map((i) => i.text));

// mutation: start KYC refresh
const refreshed = startKycRefresh("ACC-10781");
assert(refreshed!.kycStatus === "in_review", "startKycRefresh sets in_review");

// mutation: re-run screening is idempotent (no duplicate sanctions changes)
const before = getAccount("ACC-10293")!.changes.filter((c) => c.type === "sanctions").length;
runScreening("ACC-10293");
const after = getAccount("ACC-10293")!.changes.filter((c) => c.type === "sanctions").length;
assert(before === after, "runScreening is idempotent (upsert, no dupes)");

console.log("\nALL BACKEND SMOKE CHECKS PASSED");
