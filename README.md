# Bank al Etihad — Corporate KYC Watch

A real, full-stack KYC/AML monitoring dashboard. It watches a book of corporate
accounts for ownership, sanctions, PEP, litigation and adverse-media changes,
scores their risk, and drives KYC refresh cycles — branded to **Bank al Etihad**
(deep teal + signature orange + charcoal navy).

> There is **no mock data** in this app. Every figure on the dashboard — risk
> scores, KYC statuses, sanctions hits, trends, the live feed, the review queue
> and the AI insights — is computed by a deterministic screening engine over a
> real SQLite database, served through validated server functions, and mutated
> (and persisted) by the on-screen actions.

## Stack

- **TanStack Start** (React 19 SSR) + **Vite 7** + **Nitro** (node-server preset)
- **Tailwind CSS v4** (oklch design tokens) + **shadcn/ui** + **Recharts**
- **TanStack Query** for data fetching / cache invalidation
- **better-sqlite3** embedded database (auto-migrated + seeded on first boot)
- **Zod**-validated **server functions** (`createServerFn`) as the API boundary
- **@anthropic-ai/sdk** — the Cowork Compliance advisor (default `claude-opus-4-8`)

## Architecture

```
Browser (dashboard, TanStack Query)
   │  useQuery / useMutation
   ▼
src/lib/api/kyc.functions.ts     server functions (Zod-validated RPC)
   │
   ├── src/lib/server/screening.server.ts   deterministic screening engine (pure)
   └── src/lib/server/repository.server.ts  data access (reads/writes → domain objects)
   ▼
src/lib/server/db.server.ts      better-sqlite3 (./data/kyc.db, migrated + seeded)
```

### The screening engine (`screening.server.ts`)
Pure, deterministic functions compute, per account:
- **Sanctions screening** — normalized token + Levenshtein name-matching of every
  beneficial owner against a seeded OFAC/UN/EU/PEP watchlist (match ≥ 0.85).
- **Ownership threshold** — any UBO at/above the 25% disclosure threshold.
- **PEP exposure** — politically-exposed beneficial owners.
- **Review status** — `overdue` / `due_soon` / `current` from the next-review date.
- **Risk score (0–100) → level** — weighted across the signals above.

### Data model (SQLite)
`corporate_accounts`, `ubos`, `watchlist_entries`, `detected_changes` (with a
review status), and an `audit_events` log written by every mutation.

### Server functions
Queries: dashboard stats, accounts (server-side search/filter/sort), account detail,
detection trend (7d/30d/90d), risk distribution, live feed, review queue, AI insights.
Mutations (persist + audit): start KYC refresh, escalate, acknowledge change,
start triage, re-run screening.

## Running locally

Requires Node 22+.

```bash
npm install
npm run dev          # http://localhost:8080  (DB auto-seeds ~40 accounts on first run)
```

Production build + run (node-server):

```bash
npm run build                       # outputs .output/server/index.mjs
PORT=3000 node .output/server/index.mjs
```

The database file lives at `./data/kyc.db` (gitignored). Override the path with
`KYC_DB_PATH`. Delete the file to re-seed from scratch.

## Tests

Backend data-layer smoke test (seed + engine + queries + mutations):

```bash
npx tsx scripts/smoke-backend.ts
```

Load tests (k6) against a running server — see `tests/k6/`:

```bash
BASE_URL=http://localhost:3000 bash scripts/run-k6.sh
# or: k6 run tests/k6/smoke.js   /   k6 run tests/k6/load.js
```

Thresholds: `http_req_failed < 1%`, `p(95) < 500ms`. The `/_serverFn/<hash>` IDs in
`tests/k6/endpoints.js` are build-specific — re-capture them from the browser
network panel if you rebuild.

## Sections

All six sidebar sections are live, real pages: **Overview, Accounts, Alerts,
Reviews, Detections, Sources, Settings**. Settings drives the screening engine
(match / ownership / review thresholds, "re-screen all") and configures the
Cowork Compliance agent.

## Cowork Compliance (CBJ guidance)

A Claude-powered advisor that, per case, recommends the actions required under
**Central Bank of Jordan AML/CFT instructions** — CDD/EDD, beneficial-ownership
verification, PEP handling, sanctions escalation, monitoring cadence, and whether
to file an STR with the AMLU — each tagged with the relevant CBJ instruction area.

Enable it in **Settings → Cowork Compliance agent**: paste your Anthropic (Claude)
API key (from <https://console.anthropic.com>) and Save. The key is stored
server-side only and is never sent to the browser. Then open any account and
choose **Get CBJ compliance guidance**.

> AI-assisted guidance only — final AML/CFT decisions rest with the bank's MLRO /
> compliance officer. This project is a demonstration, not affiliated with or
> endorsed by Bank al Etihad or the Central Bank of Jordan; the brand mark is an
> original geometric mark, not a copy of the bank's trademarked logo.
