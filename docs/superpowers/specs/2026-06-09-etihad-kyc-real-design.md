# Bank al Etihad — Corporate KYC Watch (real implementation) — Design Spec

**Date:** 2026-06-09
**Status:** Approved (autonomous build)

## Goal
Turn `nano-kyc-watch` (a Lovable-built, fully-mocked "Sentinel KYC" dashboard) into a real,
no-mock, full-stack application and rebrand it to **Bank al Etihad**.

## Scope (locked)
- **Breadth:** the single Overview dashboard, made 100% real. Other sidebar sections remain
  visible but are explicitly labelled "not yet built" (no fake functionality).
- **Detection:** deterministic, rule-based engine computing over a real database.
- **Persistence:** embedded SQLite (`better-sqlite3`), auto-migrated + seeded on first boot.
- **Branding:** full rebrand — Bank al Etihad palette (teal/orange/charcoal), name, logo, type.

## Architecture
TanStack Start (React 19 SSR) unchanged. Add:
- **Data layer** — `src/lib/server/db.ts` (connection, PRAGMAs, migration runner), schema DDL,
  idempotent seed (`src/lib/server/seed.ts`).
- **Screening engine** — `src/lib/server/screening.ts`: pure deterministic functions
  (sanctions name-matching vs watchlist, UBO >25% threshold, PEP exposure, review-due,
  weighted risk score → level, AI confidence).
- **Server functions** — `src/lib/api/kyc.functions.ts` via `createServerFn` + Zod:
  queries (stats, list w/ server-side search+filter+sort, detail, trend by window,
  distribution, live feed, review queue, computed insights) and mutations
  (startKycRefresh, escalateAccount, acknowledgeChange, startTriage, runScreening) —
  each persists and writes an `audit_events` row.
- **Frontend** — `routes/index.tsx` rewired to TanStack Query with loading/error/empty states;
  `lib/kyc-data.ts` (mock) deleted; shared types in `lib/kyc-types.ts`; mutations wired to
  every previously-dead button with sonner toasts.

## Data model (SQLite)
`corporate_accounts`, `ubos`, `watchlist_entries`, `detected_changes` (with status),
`audit_events`. ~40 seeded accounts incl. the original 7 narratives, with UBOs + a seeded
sanctions/PEP watchlist so screening is real. Changes seeded with `detected_at` spread over
90 days so trend windows (7D/30D/90D) have real data.

## Detection rules (deterministic)
1. Sanctions: normalized token-set name match of each UBO vs `watchlist_entries`
   (ratio ≥ 0.85 → match). Critical for OFAC/UN, high for PEP lists.
2. Ownership: any UBO ≥ 25% → high-severity ownership change.
3. PEP: any `is_pep` UBO → medium directors/PEP change.
4. Review status: from `next_review` vs today (overdue / due_soon ≤30d / current); `in_review`
   preserved when set by a mutation.
5. Risk score 0–100: weighted (sanctions +40, PEP +15, ownership breach +15, high-risk
   jurisdiction +15, overdue +10, adverse media +10) → level (≥80 crit, ≥60 high, ≥40 med).

## Build / run / test
- Nitro **node-server** preset (native module → not Cloudflare). Node 22 via nvm in WSL.
- k6 smoke + load scripts in `tests/k6/` with thresholds (`http_req_failed<0.01`, `p95<500ms`).

## Non-goals
No auth, no Arabic/RTL, no live external sanctions feeds, no LLM calls. (Available as follow-ups.)
