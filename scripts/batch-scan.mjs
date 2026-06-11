/**
 * Automated daily QR batch scan — runs as a Windows Scheduled Task every weekday at 08:00.
 *
 * Usage:
 *   node scripts/batch-scan.mjs
 *   node scripts/batch-scan.mjs --dir "C:\KYC\incoming"   (override directory)
 *
 * The scan directory is read from the app_settings table in data/kyc.db.
 * Set it via Settings → Automated QR batch scan in the web UI, or pass --dir.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ── resolve DB path ──────────────────────────────────────────────────────────
const dbPath = process.env.KYC_DB_PATH ?? path.join(projectRoot, "data", "kyc.db");

// ── load native better-sqlite3 via require (it is CJS) ──────────────────────
const require = createRequire(import.meta.url);
let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.error("[batch-scan] better-sqlite3 not found — run: npm install");
  process.exit(1);
}

const db = new Database(dbPath, { readonly: false });

// ── read settings ────────────────────────────────────────────────────────────
function getConfig() {
  const row = db
    .prepare(
      "SELECT ai_api_key AS apiKey, ai_model AS model, scan_directory AS scanDir FROM app_settings WHERE id = 1",
    )
    .get();
  return {
    apiKey: row?.apiKey ?? "",
    model: row?.model || "claude-opus-4-8",
    scanDir: row?.scanDir ?? "",
  };
}

// ── parse optional --dir override ────────────────────────────────────────────
const dirArgIdx = process.argv.indexOf("--dir");
const dirOverride = dirArgIdx !== -1 ? process.argv[dirArgIdx + 1] : null;

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { apiKey, model, scanDir } = getConfig();
  const targetDir = dirOverride || scanDir;

  if (!targetDir || !targetDir.trim()) {
    console.error(
      "[batch-scan] No scan directory configured.\n" +
        "  Set it in Settings → Automated QR batch scan, or pass --dir <path>.",
    );
    process.exit(1);
  }

  if (!apiKey || !apiKey.trim()) {
    console.error(
      "[batch-scan] No Anthropic API key configured.\n" +
        "  Add one in Settings → Cowork Compliance agent.",
    );
    process.exit(1);
  }

  console.log(`[batch-scan] ${new Date().toISOString()} — scanning: ${targetDir}`);

  // Dynamically import the server modules so this script doesn't need a build step.
  // We use tsx (or ts-node) via the package.json scripts entry, or the compiled
  // output if running from dist. For simplicity we import the TS source directly
  // via the tsx loader (see package.json "batch-scan" script).
  let scanDirectoryForQr, processBatchItems;
  try {
    ({ scanDirectoryForQr } = await import("../src/lib/server/pdf-scanner.server.ts"));
    ({ processBatchItems } = await import("../src/lib/server/registration-agent.server.ts"));
  } catch (e) {
    console.error("[batch-scan] Failed to load server modules:", e.message);
    process.exit(1);
  }

  // 1. Scan PDFs for QR codes
  let scanItems;
  try {
    scanItems = await scanDirectoryForQr(targetDir);
  } catch (e) {
    console.error("[batch-scan] Scan failed:", e.message);
    process.exit(1);
  }

  const found = scanItems.filter((i) => i.qrFound);
  const missing = scanItems.filter((i) => !i.qrFound);
  console.log(`[batch-scan] PDFs: ${scanItems.length} total, ${found.length} with QR, ${missing.length} without`);

  if (found.length === 0) {
    console.log("[batch-scan] Nothing to process — exiting.");
    process.exit(0);
  }

  // 2. Run AI extraction + send notification emails
  // contactEmails: we don't have per-file emails at this stage — the AI will
  // try to extract them from the QR data. Pass empty record; the agent
  // falls back to the email found in the QR payload.
  const contactEmails = {};

  const results = await processBatchItems(scanItems, contactEmails, apiKey, model);

  const notified = results.filter((r) => r.emailSent).length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(
    `[batch-scan] Done — processed: ${results.length}, notified: ${notified}, errors: ${errors}`,
  );
  if (errors > 0) {
    results
      .filter((r) => r.status === "error")
      .forEach((r) => console.error(`  ✗ ${r.fileName}: ${r.error}`));
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[batch-scan] Unexpected error:", e);
  process.exit(1);
});
