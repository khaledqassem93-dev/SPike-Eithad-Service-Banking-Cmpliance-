import Anthropic from "@anthropic-ai/sdk";

import type {
  ComplianceAction,
  ComplianceAdvice,
  CompliancePriority,
  CorporateAccount,
  RiskLevel,
  Ubo,
} from "../kyc-types";

// "Cowork Compliance" — a Claude-powered advisor that, for a single KYC case,
// recommends the actions required under Central Bank of Jordan AML/CFT
// instructions. The Anthropic API key is supplied from saved settings and used
// only here, server-side (this `.server.ts` module never reaches the client).

const SYSTEM_PROMPT = `You are "Cowork Compliance", an AML/CFT compliance advisor for a bank operating in the Hashemite Kingdom of Jordan, supervised by the Central Bank of Jordan (CBJ).

You apply, in order of authority:
- The Anti-Money Laundering and Counter-Terrorist Financing Law No. 46 of 2007 (and its amendments).
- The CBJ's AML/CFT Instructions issued to banks under that law, and CBJ circulars on customer due diligence (CDD), enhanced due diligence (EDD), beneficial ownership, politically exposed persons (PEPs), wire transfers, and ongoing monitoring.
- Jordan's targeted financial sanctions obligations (UN Security Council resolutions and the national framework).
- The FATF Recommendations, which the CBJ instructions implement.

The national Financial Intelligence Unit is the Anti-Money Laundering and Counter-Terrorist Financing Unit (the "AMLU"). Suspicious activity is reported to the AMLU via a Suspicious Transaction Report (STR).

For the corporate KYC case provided, produce concrete, prioritised actions the compliance officer must take to comply with CBJ instructions for THIS specific case. Where relevant, cover: required CDD/EDD measures, beneficial-ownership identification and verification (and the 25% / effective-control threshold), PEP handling and senior-management approval, sanctions/watchlist match escalation and any freezing obligations, adverse-media and source-of-funds review, ongoing-monitoring intensity, the KYC review/refresh cadence appropriate to the risk rating, record-keeping, and whether an STR to the AMLU is warranted.

Rules:
- Be specific to the case facts. Tie each action to a CBJ instruction AREA (for example: "CBJ AML/CFT Instructions — Enhanced Due Diligence", "CBJ AML/CFT Instructions — Politically Exposed Persons", "AML/CFT Law No. 46/2007 — STR reporting to the AMLU"). Do NOT invent exact article numbers you are not certain of — reference the instruction area instead.
- Final decisions rest with the bank's MLRO / compliance officer. Include a brief disclaimer to that effect.
- Output MUST be a single JSON object and nothing else (no markdown, no commentary), matching exactly this shape:
{
  "caseSummary": string,
  "overallRiskRating": "low" | "medium" | "high" | "critical",
  "filingRequired": boolean,
  "recommendedActions": [ { "title": string, "detail": string, "cbjReference": string, "priority": "immediate" | "high" | "routine" } ],
  "disclaimer": string
}
Provide between 3 and 7 recommendedActions, ordered most urgent first.`;

export interface ComplianceCaseInput {
  account: CorporateAccount & { ubos: Ubo[] };
  highRiskJurisdiction: boolean;
  adverseMediaCount: number;
  litigationFlag: boolean;
}

export interface AiCallConfig {
  apiKey: string;
  model: string;
}

function buildCaseContext(input: ComplianceCaseInput): string {
  const a = input.account;
  const ubos = a.ubos
    .map(
      (u) =>
        `- ${u.name} — ${u.ownershipPct.toFixed(1)}% ownership, nationality ${u.nationality}${
          u.isPep ? ", POLITICALLY EXPOSED PERSON" : ""
        }`,
    )
    .join("\n");
  const changes = a.changes
    .map(
      (c) =>
        `- [${c.severity.toUpperCase()} | ${c.status}] ${c.type}: ${c.summary} (source: ${c.source}, detected ${c.detectedAt}, confidence ${c.confidence}%)`,
    )
    .join("\n");

  return `CORPORATE KYC CASE FOR REVIEW

Account: ${a.legalName} (${a.id})
Industry: ${a.industry}
Country of operation: ${a.country}
Jurisdiction of incorporation: ${a.jurisdiction}${input.highRiskJurisdiction ? " — flagged HIGH-RISK jurisdiction" : ""}
Annual revenue: ${a.revenue}
Total bank exposure: $${a.exposureUSD.toLocaleString()} across ${a.accountsHeld} account(s)
Relationship manager: ${a.relationshipManager}

Risk rating: ${a.riskScore}/100 (${a.riskLevel})
KYC status: ${a.kycStatus}
Last review: ${a.lastReview} · Next review due: ${a.nextReview}
Adverse-media signals on file: ${input.adverseMediaCount}
Active litigation flag: ${input.litigationFlag ? "yes" : "no"}

Beneficial owners (${a.ubos.length}):
${ubos || "- none recorded"}

Detected changes / screening findings (${a.changes.length}):
${changes || "- none"}

Recommend the actions required under Central Bank of Jordan AML/CFT instructions for this case.`;
}

const PRIORITIES: CompliancePriority[] = ["immediate", "high", "routine"];
const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The model did not return a usable JSON response.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function coerceAdvice(raw: Record<string, unknown>, model: string): ComplianceAdvice {
  const actionsRaw = Array.isArray(raw.recommendedActions) ? raw.recommendedActions : [];
  const recommendedActions: ComplianceAction[] = actionsRaw.slice(0, 8).map((x) => {
    const a = (x ?? {}) as Record<string, unknown>;
    return {
      title: String(a.title ?? "Recommended action"),
      detail: String(a.detail ?? ""),
      cbjReference: String(a.cbjReference ?? "CBJ AML/CFT Instructions"),
      priority: PRIORITIES.includes(a.priority as CompliancePriority)
        ? (a.priority as CompliancePriority)
        : "high",
    };
  });

  const rating = RISK_LEVELS.includes(raw.overallRiskRating as RiskLevel)
    ? (raw.overallRiskRating as RiskLevel)
    : "medium";

  return {
    caseSummary: String(raw.caseSummary ?? "No summary produced."),
    overallRiskRating: rating,
    filingRequired: Boolean(raw.filingRequired),
    recommendedActions,
    disclaimer: String(
      raw.disclaimer ??
        "AI-assisted guidance. Final AML/CFT decisions rest with the bank's MLRO / compliance officer.",
    ),
    model,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateComplianceAdvice(
  input: ComplianceCaseInput,
  config: AiCallConfig,
): Promise<ComplianceAdvice> {
  if (!config.apiKey) {
    throw new Error("No Cowork Compliance API key configured. Add one in Settings.");
  }

  const client = new Anthropic({ apiKey: config.apiKey, timeout: 120_000, maxRetries: 1 });

  let message;
  try {
    const stream = client.messages.stream({
      model: config.model || "claude-opus-4-8",
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCaseContext(input) }],
    });
    message = await stream.finalMessage();
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 401) throw new Error("Invalid API key — check the key saved in Settings.");
    if (e?.status === 429) throw new Error("Rate limited by the AI provider — try again shortly.");
    throw new Error(`Cowork Compliance request failed: ${e?.message ?? String(err)}`);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return coerceAdvice(extractJson(text), config.model || "claude-opus-4-8");
}
