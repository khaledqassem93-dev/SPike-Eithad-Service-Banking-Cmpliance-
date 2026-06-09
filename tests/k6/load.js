import http from "k6/http";
import { check, sleep, group } from "k6";

import { BASE, DATA_FN_IDS, ACCOUNTS_URL, TREND_URL, dataUrl, FN_PARAMS } from "./endpoints.js";

// Load test: ramp to 30 concurrent virtual users and hold, simulating many
// compliance officers loading the dashboard at once. Each iteration mirrors a
// real page load: the homepage plus the dashboard data RPCs (which hit SQLite).
// Thresholds fail the run if error rate or p95 latency breach SLOs.

export const options = {
  scenarios: {
    dashboard: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 30 },
        { duration: "60s", target: 30 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  group("page load", () => {
    const home = http.get(`${BASE}/`);
    check(home, { "home 200": (r) => r.status === 200 });

    // Fan out the dashboard data requests, as the client does on load.
    const responses = http.batch([
      ...DATA_FN_IDS.map((id) => ["GET", dataUrl(id), null, FN_PARAMS]),
      ["GET", ACCOUNTS_URL, null, FN_PARAMS],
      ["GET", TREND_URL, null, FN_PARAMS],
    ]);
    for (const res of responses) {
      check(res, { "data 200": (r) => r.status === 200 });
    }
  });
  sleep(1);
}
