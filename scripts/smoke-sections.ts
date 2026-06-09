// End-to-end test of the new section backend against a throwaway SQLite DB.
// Run: KYC_DB_PATH=/tmp/kyc-smoke.db npx tsx scripts/smoke-sections.ts
import {
  completeKycReview,
  getRiskDistribution,
  getSettings,
  getSources,
  listAlerts,
  listDetections,
  listReviews,
  resolveChange,
  rescreenAll,
  updateSettings,
} from "../src/lib/server/repository.server";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ok:", msg);
}

// Detections + alerts (reads)
const detections = listDetections({});
assert(detections.length > 0, `listDetections returned ${detections.length} rows`);
const openAlerts = listAlerts({ status: "open" });
assert(openAlerts.length > 0, `listAlerts(open) returned ${openAlerts.length}`);

// Resolve an alert -> it leaves the open set
const target = openAlerts[0];
const resolved = resolveChange(target.id);
assert(resolved?.status === "resolved", `resolveChange set status=resolved for ${target.id}`);
const openAfter = listAlerts({ status: "open" });
assert(openAfter.length === openAlerts.length - 1, `open alerts dropped ${openAlerts.length} -> ${openAfter.length}`);

// Reviews + complete
const reviews = listReviews();
assert(reviews.length > 0, `listReviews returned ${reviews.length}`);
const rev = reviews[0];
const done = completeKycReview(rev.id);
assert(done?.kycStatus === "current", `completeKycReview set ${rev.id} -> current`);
const reviewsAfter = listReviews();
assert(reviewsAfter.length === reviews.length - 1, `review queue dropped ${reviews.length} -> ${reviewsAfter.length}`);

// Sources aggregation
const sources = getSources();
assert(sources.feeds.length > 0 && sources.watchlists.length > 0, `sources: ${sources.feeds.length} feeds, ${sources.watchlists.length} watchlists`);

// Settings persist + drive re-screening
const before = getSettings();
const dist0 = getRiskDistribution();
updateSettings({ matchThreshold: 0.6, ownershipThreshold: 10 });
const after = getSettings();
assert(after.matchThreshold === 0.6 && after.ownershipThreshold === 10, "updateSettings persisted thresholds");
const res = rescreenAll();
assert(res.count > 0, `rescreenAll re-screened ${res.count} accounts`);
const dist1 = getRiskDistribution();
console.log("  risk distribution before:", dist0.map((d) => `${d.name}:${d.value}`).join(" "));
console.log("  risk distribution after :", dist1.map((d) => `${d.name}:${d.value}`).join(" "));
// restore
updateSettings({ matchThreshold: before.matchThreshold, ownershipThreshold: before.ownershipThreshold });

console.log("\nALL SECTION SMOKE TESTS PASSED");
