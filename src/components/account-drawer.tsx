import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  FileSearch,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AccountAvatar,
  changeIcon,
  fmtMoney,
  RiskBadge,
  riskTone,
} from "@/lib/kyc-ui";
import {
  fetchAccount,
  fetchSettings,
  mutateAcknowledgeChange,
  mutateAdviseCase,
  mutateEscalateAccount,
  mutateRunScreening,
  mutateStartKycRefresh,
} from "@/lib/api/kyc.functions";
import type { CompliancePriority } from "@/lib/kyc-types";

// Keys to refresh after any account mutation so every page stays consistent.
const INVALIDATE = [
  "stats",
  "accounts",
  "trend",
  "distribution",
  "liveFeed",
  "reviewQueue",
  "insights",
  "alerts",
  "detections",
  "reviews",
  "sources",
];

const progressFor = (status: string) =>
  status === "current" ? 100 : status === "in_review" ? 60 : status === "due_soon" ? 30 : 10;

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "accent";
}) {
  return (
    <div className="p-3 rounded-lg border border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold mt-0.5", tone === "accent" && "text-accent")}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground capitalize">{sub}</div>}
    </div>
  );
}

export function AccountDrawer({
  accountId,
  onClose,
}: {
  accountId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const accountQ = useQuery({
    queryKey: ["account", accountId],
    queryFn: () => fetchAccount({ data: { id: accountId as string } }),
    enabled: !!accountId,
  });
  const account = accountQ.data ?? null;

  function invalidate() {
    for (const k of INVALIDATE) qc.invalidateQueries({ queryKey: [k] });
    if (accountId) qc.invalidateQueries({ queryKey: ["account", accountId] });
  }

  const refreshM = useMutation({
    mutationFn: (id: string) => mutateStartKycRefresh({ data: { accountId: id } }),
    onSuccess: (a) => {
      toast.success(`KYC refresh opened for ${a.legalName}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const escalateM = useMutation({
    mutationFn: (id: string) =>
      mutateEscalateAccount({ data: { accountId: id, note: "Escalated for enhanced due diligence" } }),
    onSuccess: (a) => {
      toast.success(`${a.legalName} escalated to EDD`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const screenM = useMutation({
    mutationFn: (id: string) => mutateRunScreening({ data: { accountId: id } }),
    onSuccess: (a) => {
      toast.success(`Re-screened ${a.legalName} — risk ${a.riskScore}/100 (${a.riskLevel})`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ackM = useMutation({
    mutationFn: (changeId: string) => mutateAcknowledgeChange({ data: { changeId } }),
    onSuccess: () => {
      toast.success("Change acknowledged");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = refreshM.isPending || escalateM.isPending || screenM.isPending;

  return (
    <Dialog open={!!accountId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[88vh] overflow-y-auto gap-0">
        {!account && accountQ.isLoading && (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-12 w-2/3" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        )}

        {account && (
          <>
            <DialogHeader className="pr-6">
              <div className="flex items-center gap-3">
                <AccountAvatar name={account.legalName} size="md" />
                <div className="min-w-0 text-left">
                  <DialogTitle className="truncate">{account.legalName}</DialogTitle>
                  <DialogDescription className="text-xs">
                    {account.id} · {account.industry} · {account.jurisdiction}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile
                label="Risk score"
                value={`${account.riskScore}`}
                sub={account.riskLevel}
                tone="primary"
              />
              <StatTile
                label="AI confidence"
                value={`${account.aiConfidence}%`}
                sub="Sentinel AI"
                tone="accent"
              />
              <StatTile
                label="Exposure"
                value={fmtMoney(account.exposureUSD)}
                sub={`${account.accountsHeld} accounts`}
              />
              <StatTile label="UBOs" value={`${account.uboCount}`} sub="beneficial owners" />
            </div>

            <div className="mt-5 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => screenM.mutate(account.id)}
                disabled={busy}
              >
                {screenM.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Re-run screening
              </Button>
              <Badge variant="outline" className={cn("text-[10px] capitalize", riskTone[account.riskLevel])}>
                {account.riskLevel} risk
              </Badge>
            </div>

            <div className="mt-5">
              <div className="text-xs font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                AI-generated review summary
              </div>
              <div className="text-xs leading-relaxed p-3.5 rounded-lg border border-border bg-muted/30">
                {account.changes.length === 0
                  ? "No material changes detected since the last review. Risk posture remains stable across monitored signals."
                  : `Detected ${account.changes.length} significant change${account.changes.length > 1 ? "s" : ""} across ${
                      new Set(account.changes.map((c) => c.type)).size
                    } categor${account.changes.length > 1 ? "ies" : "y"}. ${
                      account.changes.some((c) => c.severity === "critical")
                        ? "Recommend immediate enhanced due diligence and SAR consideration."
                        : "Recommend a refreshed KYC packet within the next review window."
                    }`}
              </div>
            </div>

            <ComplianceGuidance key={account.id} accountId={account.id} />

            <div className="mt-5">
              <div className="text-xs font-semibold mb-2">KYC refresh progress</div>
              <Progress value={progressFor(account.kycStatus)} className="h-2" />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>Identification</span>
                <span>Verification</span>
                <span>Risk assessment</span>
                <span>Approval</span>
              </div>
            </div>

            {account.ubos.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold mb-2">Beneficial owners</div>
                <ul className="space-y-1.5">
                  {account.ubos.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-2 text-xs p-2.5 rounded-md border border-border"
                    >
                      <span className="font-medium truncate">{u.name}</span>
                      <span className="text-muted-foreground">{u.nationality}</span>
                      {u.isPep && (
                        <Badge variant="outline" className="text-[9px] bg-warning/15 text-[oklch(0.5_0.12_75)] border-warning/40">
                          PEP
                        </Badge>
                      )}
                      <span className="ml-auto tabular-nums font-semibold">
                        {u.ownershipPct.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5">
              <div className="text-xs font-semibold mb-2">Detected changes</div>
              {account.changes.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border">
                  No changes detected.
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {account.changes.map((c) => {
                    const Icon = changeIcon[c.type];
                    return (
                      <li key={c.id} className="p-3 rounded-lg border border-border">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              "w-7 h-7 rounded-md grid place-items-center border shrink-0",
                              riskTone[c.severity],
                            )}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium capitalize">{c.type}</span>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] capitalize", riskTone[c.severity])}
                              >
                                {c.severity}
                              </Badge>
                              {c.status !== "open" && (
                                <Badge variant="outline" className="text-[9px] capitalize">
                                  {c.status}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {c.detectedAt} · {c.confidence}%
                              </span>
                            </div>
                            <div className="text-xs mt-1 leading-snug">{c.summary}</div>
                            {(c.before || c.after) && (
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="p-2 rounded bg-muted/50">
                                  <div className="text-[9px] uppercase text-muted-foreground tracking-wide mb-0.5">
                                    Before
                                  </div>
                                  {c.before}
                                </div>
                                <div className="p-2 rounded bg-accent/10 border border-accent/30">
                                  <div className="text-[9px] uppercase text-accent tracking-wide mb-0.5">
                                    After
                                  </div>
                                  {c.after}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              <div className="text-[10px] text-muted-foreground">Source: {c.source}</div>
                              {c.status === "open" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2"
                                  onClick={() => ackM.mutate(c.id)}
                                  disabled={ackM.isPending}
                                >
                                  <ShieldCheck className="w-3 h-3 mr-1" /> Acknowledge
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-5 flex gap-2 sticky bottom-0 bg-background pt-3 pb-1 -mx-6 px-6 border-t border-border">
              <Button
                className="flex-1"
                style={{ background: "var(--gradient-primary)" }}
                onClick={() => refreshM.mutate(account.id)}
                disabled={busy}
              >
                {refreshM.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <FileSearch className="w-4 h-4 mr-1.5" />
                )}
                Start KYC refresh
              </Button>
              <Button variant="outline" onClick={() => escalateM.mutate(account.id)} disabled={busy}>
                {escalateM.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                )}
                Escalate
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function priorityTone(p: CompliancePriority): string {
  return p === "immediate"
    ? "bg-risk-critical/15 text-risk-critical border-risk-critical/40"
    : p === "high"
      ? "bg-risk-high/15 text-risk-high border-risk-high/30"
      : "bg-risk-low/15 text-risk-low border-risk-low/30";
}

function ComplianceGuidance({ accountId }: { accountId: string }) {
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });
  const configured = settingsQ.data?.aiConfigured;
  const adviseM = useMutation({
    mutationFn: () => mutateAdviseCase({ data: { accountId } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const advice = adviseM.data;

  return (
    <div className="mt-5">
      <div className="text-xs font-semibold mb-2 flex items-center gap-2">
        <Scale className="w-3.5 h-3.5 text-accent" />
        Cowork Compliance — Central Bank of Jordan guidance
      </div>

      {configured === false ? (
        <div className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border">
          Add your Anthropic API key in{" "}
          <Link to="/settings" className="text-accent underline">
            Settings
          </Link>{" "}
          to enable Cowork Compliance.
        </div>
      ) : !advice ? (
        <div>
          <Button
            size="sm"
            onClick={() => adviseM.mutate()}
            disabled={adviseM.isPending || !configured}
            style={{ background: "var(--gradient-primary)" }}
          >
            {adviseM.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Scale className="w-3.5 h-3.5 mr-1.5" />
            )}
            {adviseM.isPending ? "Consulting CBJ instructions…" : "Get CBJ compliance guidance"}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Recommends the actions required under Central Bank of Jordan AML/CFT instructions for
            this specific case.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge
                variant="outline"
                className={cn("text-[10px] capitalize", riskTone[advice.overallRiskRating])}
              >
                {advice.overallRiskRating} risk
              </Badge>
              {advice.filingRequired && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-danger/10 text-danger border-danger/30"
                >
                  STR filing recommended
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">{advice.model}</span>
            </div>
            <p className="text-xs leading-relaxed">{advice.caseSummary}</p>
          </div>

          <ol className="space-y-2">
            {advice.recommendedActions.map((a, i) => (
              <li key={i} className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-muted-foreground">{i + 1}.</span>
                  <span className="text-xs font-medium">{a.title}</span>
                  <Badge
                    variant="outline"
                    className={cn("text-[9px] capitalize ml-auto", priorityTone(a.priority))}
                  >
                    {a.priority}
                  </Badge>
                </div>
                <p className="text-xs mt-1 leading-snug">{a.detail}</p>
                <div className="text-[10px] text-accent mt-1.5">{a.cbjReference}</div>
              </li>
            ))}
          </ol>

          <p className="text-[10px] text-muted-foreground leading-snug">{advice.disclaimer}</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => adviseM.mutate()}
            disabled={adviseM.isPending}
          >
            {adviseM.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}
