import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  extractQrData,
  checkAndNotifyChanges,
  scanDirectoryQr,
  processBatchItems,
} from "../server/registration-agent.server";
import type { QrField } from "../registration-types";

import {
  acknowledgeChange,
  adviseCase,
  completeKycReview,
  escalateAccount,
  getAccount,
  getAiInsights,
  getDashboardStats,
  getDetectionTrend,
  getLiveFeed,
  getReviewQueue,
  getRiskDistribution,
  getSettings,
  getSources,
  listAccounts,
  listAlerts,
  listDetections,
  listReviews,
  rescreenAll,
  resolveChange,
  runScreening,
  startKycRefresh,
  startTriage,
  updateSettings,
  saveClientSubmission,
  listClientSubmissions,
  updateClientSubmissionStatus,
} from "../server/repository.server";

// Server functions = the validated RPC boundary between the dashboard and the
// SQLite-backed repository. Handler bodies run server-only; the repository
// (and better-sqlite3) never reach the client bundle.

const riskFilter = z.enum(["all", "low", "medium", "high", "critical"]);

/* ---------------- queries ---------------- */

export const fetchDashboardStats = createServerFn({ method: "GET" }).handler(async () =>
  getDashboardStats(),
);

export const fetchAccounts = createServerFn({ method: "GET" })
  .validator(
    z.object({
      query: z.string().optional(),
      riskFilter: riskFilter.optional(),
      sort: z.enum(["risk", "exposure", "review"]).optional(),
    }),
  )
  .handler(async ({ data }) =>
    listAccounts({ query: data.query, riskFilter: data.riskFilter, sort: data.sort }),
  );

export const fetchAccount = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => getAccount(data.id));

export const fetchDetectionTrend = createServerFn({ method: "GET" })
  .validator(z.object({ window: z.enum(["7d", "30d", "90d"]) }))
  .handler(async ({ data }) => getDetectionTrend(data.window));

export const fetchRiskDistribution = createServerFn({ method: "GET" }).handler(async () =>
  getRiskDistribution(),
);

export const fetchLiveFeed = createServerFn({ method: "GET" }).handler(async () => getLiveFeed());

export const fetchReviewQueue = createServerFn({ method: "GET" }).handler(async () =>
  getReviewQueue(),
);

export const fetchAiInsights = createServerFn({ method: "GET" }).handler(async () => getAiInsights());

/* ---------------- mutations ---------------- */

export const mutateStartKycRefresh = createServerFn({ method: "POST" })
  .validator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const account = startKycRefresh(data.accountId);
    if (!account) throw new Error(`Account ${data.accountId} not found`);
    return account;
  });

export const mutateEscalateAccount = createServerFn({ method: "POST" })
  .validator(z.object({ accountId: z.string().min(1), note: z.string().max(500).optional() }))
  .handler(async ({ data }) => {
    const account = escalateAccount(data.accountId, data.note);
    if (!account) throw new Error(`Account ${data.accountId} not found`);
    return account;
  });

export const mutateAcknowledgeChange = createServerFn({ method: "POST" })
  .validator(z.object({ changeId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const change = acknowledgeChange(data.changeId);
    if (!change) throw new Error(`Change ${data.changeId} not found`);
    return change;
  });

export const mutateStartTriage = createServerFn({ method: "POST" }).handler(async () => startTriage());

export const mutateRunScreening = createServerFn({ method: "POST" })
  .validator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const account = runScreening(data.accountId);
    if (!account) throw new Error(`Account ${data.accountId} not found`);
    return account;
  });

/* ---------------- section pages: queries ---------------- */

const changeType = z.enum([
  "all",
  "ownership",
  "directors",
  "address",
  "sanctions",
  "litigation",
  "financials",
  "industry",
  "media",
]);
const severity = z.enum(["all", "low", "medium", "high", "critical"]);
const changeStatus = z.enum(["all", "open", "acknowledged", "resolved"]);
const trendWindow = z.enum(["all", "7d", "30d", "90d"]);

export const fetchAlerts = createServerFn({ method: "GET" })
  .validator(z.object({ severity: severity.optional(), status: changeStatus.optional() }).optional())
  .handler(async ({ data }) => listAlerts({ severity: data?.severity, status: data?.status }));

export const fetchDetections = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        type: changeType.optional(),
        severity: severity.optional(),
        status: changeStatus.optional(),
        window: trendWindow.optional(),
        query: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => listDetections({ ...(data ?? {}) }));

export const fetchReviews = createServerFn({ method: "GET" }).handler(async () => listReviews());

export const fetchSources = createServerFn({ method: "GET" }).handler(async () => getSources());

export const fetchSettings = createServerFn({ method: "GET" }).handler(async () => getSettings());

/* ---------------- section pages: mutations ---------------- */

export const mutateResolveChange = createServerFn({ method: "POST" })
  .validator(z.object({ changeId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const change = resolveChange(data.changeId);
    if (!change) throw new Error(`Change ${data.changeId} not found`);
    return change;
  });

export const mutateCompleteReview = createServerFn({ method: "POST" })
  .validator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const account = completeKycReview(data.accountId);
    if (!account) throw new Error(`Account ${data.accountId} not found`);
    return account;
  });

export const mutateUpdateSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      matchThreshold: z.number().min(0.5).max(0.99).optional(),
      ownershipThreshold: z.number().min(5).max(75).optional(),
      dueSoonDays: z.number().int().min(7).max(180).optional(),
      autoEscalateCritical: z.boolean().optional(),
      officerName: z.string().min(1).max(80).optional(),
      orgName: z.string().min(1).max(80).optional(),
      aiModel: z.string().min(1).max(60).optional(),
      aiApiKey: z.string().max(300).optional(),
      scanDirectory: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => updateSettings(data));

export const mutateRescreenAll = createServerFn({ method: "POST" }).handler(async () => rescreenAll());

/* ---------------- Company registration — QR extraction ------------ */

export const mutateExtractQrData = createServerFn({ method: "POST" })
  .validator(z.object({ qrText: z.string().min(1) }))
  .handler(async ({ data }) => {
    const settings = getSettings();
    return extractQrData(data.qrText, settings.aiApiKey ?? "", settings.aiModel ?? "claude-sonnet-4-6");
  });

/* ---------------- Company registration — form submission ----------- */

const qrFieldSchema = z.object({
  fieldKey: z.string(),
  labelEn: z.string(),
  labelAr: z.string(),
  value: z.string(),
  found: z.boolean(),
});

/* ---------------- Batch: scan a directory of PDFs ----------------- */

export const mutateScanDirectory = createServerFn({ method: "POST" })
  .validator(z.object({ dirPath: z.string().min(1) }))
  .handler(async ({ data }) => scanDirectoryQr(data.dirPath));

export const mutateProcessBatch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      items: z.array(
        z.object({
          fileName: z.string(),
          filePath: z.string(),
          qrFound: z.boolean(),
          qrText: z.string(),
          pageNumber: z.number(),
          error: z.string().optional(),
        }),
      ),
      contactEmails: z.record(z.string(), z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const settings = getSettings();
    return processBatchItems(
      data.items,
      data.contactEmails,
      settings.aiApiKey ?? "",
      settings.aiModel ?? "claude-sonnet-4-6",
    );
  });

export const mutateSubmitRegistration = createServerFn({ method: "POST" })
  .validator(
    z.object({
      form: z.object({
        legalEntityType: z.string(),
        profitStatus: z.enum(["profit", "nonprofit"]),
        businessLine: z.string(),
        legalNameAr: z.string(),
        legalNameEn: z.string(),
        declaredCapital: z.string(),
        mainActivity: z.string(),
        isListed: z.boolean(),
        companyNationality: z.string(),
        nationalId: z.string(),
        registrationNumber: z.string(),
        taxNumber: z.string(),
        taxExemptionStatus: z.enum(["exempt", "partial", "none"]),
        contactName: z.string(),
        contactEmail: z.string().email(),
      }),
      qrFields: z.array(qrFieldSchema),
    }),
  )
  .handler(async ({ data }) => {
    return checkAndNotifyChanges(data.form, data.qrFields as QrField[]);
  });

/* ---------------- Client submissions ---------------- */

const clientSubmissionSchema = z.object({
  legalEntityType: z.string(),
  profitStatus: z.string(),
  businessLine: z.string(),
  legalNameAr: z.string(),
  legalNameEn: z.string(),
  declaredCapital: z.string(),
  mainActivity: z.string(),
  isListed: z.boolean(),
  companyNationality: z.string(),
  nationalId: z.string(),
  registrationNumber: z.string(),
  taxNumber: z.string(),
  taxExemptionStatus: z.string(),
  contactName: z.string(),
  contactEmail: z.string().email(),
});

export const mutateSaveClientSubmission = createServerFn({ method: "POST" })
  .validator(clientSubmissionSchema)
  .handler(async ({ data }) => saveClientSubmission(data));

export const fetchClientSubmissions = createServerFn({ method: "GET" }).handler(async () =>
  listClientSubmissions(),
);

export const mutateClientSubmissionStatus = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), status: z.enum(["pending", "reviewed", "approved", "rejected"]) }))
  .handler(async ({ data }) => updateClientSubmissionStatus(data.id, data.status));

/* ---------------- Cowork Compliance agent ---------------- */

export const mutateAdviseCase = createServerFn({ method: "POST" })
  .validator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const advice = await adviseCase(data.accountId);
    if (!advice) throw new Error(`Account ${data.accountId} not found`);
    return advice;
  });
