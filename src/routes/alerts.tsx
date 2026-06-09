import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { AccountDrawer } from "@/components/account-drawer";
import {
  changeIcon,
  daysAgoLabel,
  EmptyState,
  ErrorState,
  PageHeader,
  riskTone,
} from "@/lib/kyc-ui";
import {
  fetchAlerts,
  mutateAcknowledgeChange,
  mutateResolveChange,
} from "@/lib/api/kyc.functions";
import type { ChangeStatus, RiskLevel } from "@/lib/kyc-types";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alerts — Bank al Etihad KYC" }] }),
  component: AlertsPage,
});

const SEVERITIES: Array<RiskLevel | "all"> = ["all", "critical", "high"];
const STATUSES: Array<ChangeStatus | "all"> = ["open", "acknowledged", "all"];
const INVALIDATE = ["alerts", "stats", "detections", "liveFeed", "insights", "accounts"];

function AlertsPage() {
  const qc = useQueryClient();
  const [severity, setSeverity] = useState<RiskLevel | "all">("all");
  const [status, setStatus] = useState<ChangeStatus | "all">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["alerts", severity, status],
    queryFn: () => fetchAlerts({ data: { severity, status } }),
  });
  const rows = q.data ?? [];

  function invalidate() {
    for (const k of INVALIDATE) qc.invalidateQueries({ queryKey: [k] });
  }
  const ackM = useMutation({
    mutationFn: (changeId: string) => mutateAcknowledgeChange({ data: { changeId } }),
    onSuccess: () => {
      toast.success("Alert acknowledged");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolveM = useMutation({
    mutationFn: (changeId: string) => mutateResolveChange({ data: { changeId } }),
    onSuccess: () => {
      toast.success("Alert resolved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppShell active="alerts" title="Alerts" subtitle="Action queue">
        <PageHeader
          title="Alerts"
          description="High-severity and sanctions detections that need a compliance decision."
        />

        <Card className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Severity</span>
            {SEVERITIES.map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={cn(
                  "px-2.5 py-1 rounded-full border capitalize transition-colors",
                  severity === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "px-2.5 py-1 rounded-full border capitalize transition-colors",
                  status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ml-auto text-muted-foreground">
            {!q.isLoading && `${rows.length} alert${rows.length === 1 ? "" : "s"}`}
          </div>
        </Card>

        {q.isError ? (
          <Card>
            <ErrorState onRetry={() => q.refetch()} label="Couldn't load alerts." />
          </Card>
        ) : q.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon={CheckCircle2} label="No alerts match — the book is clear for this filter." />
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((a) => {
              const Icon = changeIcon[a.type];
              const acking = ackM.isPending && ackM.variables === a.id;
              const resolving = resolveM.isPending && resolveM.variables === a.id;
              return (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "w-9 h-9 rounded-md grid place-items-center border shrink-0",
                        riskTone[a.severity],
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setSelectedId(a.accountId)}
                          className="font-medium text-sm hover:underline"
                        >
                          {a.legalName}
                        </button>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] capitalize", riskTone[a.severity])}
                        >
                          {a.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {a.type}
                        </Badge>
                        {a.status !== "open" && (
                          <Badge variant="outline" className="text-[9px] capitalize">
                            {a.status}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                          {daysAgoLabel(a.detectedAt)} · {a.confidence}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{a.summary}</p>
                      <div className="text-[10px] text-muted-foreground mt-1">Source: {a.source}</div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setSelectedId(a.accountId)}
                        >
                          Open account
                        </Button>
                        {a.status === "open" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={acking}
                            onClick={() => ackM.mutate(a.id)}
                          >
                            {acking ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3 h-3 mr-1" />
                            )}
                            Acknowledge
                          </Button>
                        )}
                        {a.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={resolving}
                            onClick={() => resolveM.mutate(a.id)}
                          >
                            {resolving ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                            )}
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </AppShell>

      <AccountDrawer accountId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
