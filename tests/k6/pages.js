import http from "k6/http";
import { check, sleep } from "k6";

// Load test across the full multi-page app (SSR page routes).
const BASE = __ENV.BASE_URL || "http://localhost:3001";
const ROUTES = ["/", "/accounts", "/alerts", "/reviews", "/detections", "/sources", "/settings"];

export const options = {
  stages: [
    { duration: "10s", target: 5 },
    { duration: "40s", target: 20 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  for (const r of ROUTES) {
    const res = http.get(BASE + r);
    check(res, {
      [`status 200 ${r}`]: (x) => x.status === 200,
      [`has html ${r}`]: (x) => (x.body || "").includes("Bank al Etihad"),
    });
  }
  sleep(1);
}
