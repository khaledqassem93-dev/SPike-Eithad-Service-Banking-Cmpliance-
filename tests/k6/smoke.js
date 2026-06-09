import http from "k6/http";
import { check, sleep } from "k6";

import { BASE, DATA_FN_IDS, ACCOUNTS_URL, TREND_URL, dataUrl, FN_PARAMS } from "./endpoints.js";

// Smoke test: 1 VU for 30s. Confirms the homepage and every dashboard data
// endpoint respond correctly under no load. Fails the run if thresholds breach.

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const home = http.get(`${BASE}/`);
  check(home, {
    "home 200": (r) => r.status === 200,
    "home is Bank al Etihad": (r) => (r.body || "").includes("Bank al Etihad"),
  });

  for (const id of DATA_FN_IDS) {
    const res = http.get(dataUrl(id), FN_PARAMS);
    check(res, { "data fn 200": (r) => r.status === 200 });
  }

  const accounts = http.get(ACCOUNTS_URL, FN_PARAMS);
  check(accounts, {
    "accounts 200": (r) => r.status === 200,
    "accounts returns rows": (r) => (r.body || "").includes("ACC-"),
  });

  const trend = http.get(TREND_URL, FN_PARAMS);
  check(trend, { "trend 200": (r) => r.status === 200 });

  sleep(1);
}
