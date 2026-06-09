// Real endpoints for the Bank al Etihad KYC Watch app.
//
// The /_serverFn/<hash> IDs and the encoded `payload` strings below are
// TanStack Start server-function references captured from a running production
// build (node-server preset). They are BUILD-SPECIFIC: if you rebuild the app,
// re-capture them from the browser network panel (filter: _serverFn) and update
// this file. These hit the real SQLite-backed repository — not mocks.

export const BASE = __ENV.BASE_URL || "http://localhost:3000";

// TanStack Start routes a request to a server function only when it carries
// these headers (the RPC client sets them). A plain GET without them is not
// treated as a server-fn call. Send them on every /_serverFn request.
export const FN_PARAMS = {
  headers: {
    "x-tsr-serverfn": "true",
    accept: "application/x-tss-framed, application/x-ndjson, application/json",
  },
};

// No-input GET server functions (dashboard stats, risk distribution,
// live feed, review queue, AI insights).
export const DATA_FN_IDS = [
  "cf047b3be80f45a9925779dead3fa610dcf2ec4abbbc22bbf3cc721ef22a676f",
  "a4611ef61afc07d81f78cf6947fe7b9198e555fe14084e7b84f7cc94a73a1313",
  "92c8d25b05b9d6c9987d057da116d208b8d7ac1f482b62b25b592e320fa22554",
  "4011b3a5c38ed3cc1b1cff86fb1af2bd0ac413f18efc17f0b1d4e7c591808165",
  "4aa3cf7fc614cb55f8487c0c239894b323c056cc35a96279b7050ee5d74e73b8",
];

// Accounts list (server-side search + filter + sort over SQLite).
export const ACCOUNTS_URL =
  BASE +
  "/_serverFn/d8610af61d477d0a781106e31f2a33b41b3caee6dcc068bee6b6094477055218?payload=" +
  "%7B%22t%22%3A%7B%22t%22%3A10%2C%22i%22%3A0%2C%22p%22%3A%7B%22k%22%3A%5B%22data%22%5D%2C%22v%22%3A%5B%7B%22t%22%3A10%2C%22i%22%3A1%2C%22p%22%3A%7B%22k%22%3A%5B%22query%22%2C%22riskFilter%22%5D%2C%22v%22%3A%5B%7B%22t%22%3A1%2C%22s%22%3A%22%22%7D%2C%7B%22t%22%3A1%2C%22s%22%3A%22all%22%7D%5D%7D%2C%22o%22%3A0%7D%5D%7D%2C%22o%22%3A0%7D%2C%22f%22%3A63%2C%22m%22%3A%5B%5D%7D";

// Detection trend (7d window) — real aggregation over the detections log.
export const TREND_URL =
  BASE +
  "/_serverFn/20b586b1981c1f58edceca8fb95c4f59fb56fb3b4394f109af1006b27b9704f5?payload=" +
  "%7B%22t%22%3A%7B%22t%22%3A10%2C%22i%22%3A0%2C%22p%22%3A%7B%22k%22%3A%5B%22data%22%5D%2C%22v%22%3A%5B%7B%22t%22%3A10%2C%22i%22%3A1%2C%22p%22%3A%7B%22k%22%3A%5B%22window%22%5D%2C%22v%22%3A%5B%7B%22t%22%3A1%2C%22s%22%3A%227d%22%7D%5D%7D%2C%22o%22%3A0%7D%5D%7D%2C%22o%22%3A0%7D%2C%22f%22%3A63%2C%22m%22%3A%5B%5D%7D";

export function dataUrl(id) {
  return BASE + "/_serverFn/" + id;
}
