import process from "node:process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { seedIfEmpty } from "./seed.server";

// Embedded SQLite data layer. The `.server.ts` suffix keeps this (and the
// native better-sqlite3 binding) out of the client bundle. A single
// connection is reused per server process; the DB is migrated and seeded
// lazily on first access.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS corporate_accounts (
  id                   TEXT PRIMARY KEY,
  legal_name           TEXT NOT NULL,
  ticker               TEXT,
  industry             TEXT NOT NULL,
  country              TEXT NOT NULL,
  jurisdiction         TEXT NOT NULL,
  incorporated         TEXT NOT NULL,
  revenue              TEXT NOT NULL,
  relationship_manager TEXT NOT NULL,
  risk_score           INTEGER NOT NULL DEFAULT 0,
  risk_level           TEXT NOT NULL DEFAULT 'low',
  kyc_status           TEXT NOT NULL DEFAULT 'current',
  last_review          TEXT NOT NULL,
  next_review          TEXT NOT NULL,
  ai_confidence        INTEGER NOT NULL DEFAULT 0,
  ubo_count            INTEGER NOT NULL DEFAULT 0,
  accounts_held        INTEGER NOT NULL DEFAULT 0,
  exposure_usd         INTEGER NOT NULL DEFAULT 0,
  high_risk_jurisdiction INTEGER NOT NULL DEFAULT 0,
  adverse_media_count  INTEGER NOT NULL DEFAULT 0,
  litigation_flag      INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ubos (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  ownership_pct REAL NOT NULL,
  nationality   TEXT NOT NULL,
  is_pep        INTEGER NOT NULL DEFAULT 0,
  dob           TEXT
);
CREATE INDEX IF NOT EXISTS idx_ubos_account ON ubos(account_id);

CREATE TABLE IF NOT EXISTS watchlist_entries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  list_source TEXT NOT NULL,
  program     TEXT,
  dob         TEXT,
  country     TEXT
);

CREATE TABLE IF NOT EXISTS detected_changes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL,
  confidence  INTEGER NOT NULL,
  detected_at TEXT NOT NULL,
  source      TEXT NOT NULL,
  summary     TEXT NOT NULL,
  before_val  TEXT,
  after_val   TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_changes_account ON detected_changes(account_id);
CREATE INDEX IF NOT EXISTS idx_changes_detected ON detected_changes(detected_at);
CREATE INDEX IF NOT EXISTS idx_changes_status ON detected_changes(status);

CREATE TABLE IF NOT EXISTS audit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT REFERENCES corporate_accounts(id) ON DELETE SET NULL,
  actor      TEXT NOT NULL DEFAULT 'compliance.officer',
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_events(account_id);

CREATE TABLE IF NOT EXISTS app_settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  match_threshold        REAL NOT NULL DEFAULT 0.85,
  ownership_threshold    REAL NOT NULL DEFAULT 25,
  due_soon_days          INTEGER NOT NULL DEFAULT 30,
  auto_escalate_critical INTEGER NOT NULL DEFAULT 1,
  officer_name           TEXT NOT NULL DEFAULT 'A. Okafor',
  org_name               TEXT NOT NULL DEFAULT 'Bank al Etihad',
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO app_settings (id) VALUES (1);
`;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dataDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const file = process.env.KYC_DB_PATH ?? path.join(dataDir, "kyc.db");

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  // Idempotent column migrations for the Cowork Compliance AI agent config.
  for (const col of [
    "ai_provider TEXT NOT NULL DEFAULT 'anthropic'",
    "ai_api_key TEXT NOT NULL DEFAULT ''",
    "ai_model TEXT NOT NULL DEFAULT 'claude-opus-4-8'",
  ]) {
    try {
      db.exec(`ALTER TABLE app_settings ADD COLUMN ${col}`);
    } catch {
      // column already exists — ignore
    }
  }

  seedIfEmpty(db);

  _db = db;
  return db;
}
