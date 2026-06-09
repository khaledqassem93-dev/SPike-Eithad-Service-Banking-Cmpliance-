import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { AccountDrawer } from "@/components/account-drawer";
import {
  AccountAvatar,
  EmptyState,
  ErrorState,
  PageHeader,
  RiskMeter,
  StatusBadge,
} from "@/lib/kyc-ui";
import {
  fetchReviews,
  mutateCompleteReview,
  mutateStartKycRefresh,
} from "@/lib/api/kyc.functions";

export const Route = createFileRoute("/reviews")({
  head: () => ({ meta: [{ title: "Reviews — Bank al Etihad KYC" }] }),
  component: ReviewsPage,
});

const INVALIDATE = ["reviews", "reviewQueue", "stats", "accounts", "distribution", "insights"];

function ReviewsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["reviews"], queryFn: () => fetchReviews() });
  const rows = q.data ?? [];

  function invalidate() {
    for (const k of INVALIDATE) qc.invalidateQueries({ queryKey: [k] });
  }
  const refreshM = useMutation({
    mutationFn: (accountId: string) => mutateStartKycRefresh({ data: { accountId } }),
    onSuccess: (a) => {
      toast.success(`KYC refresh opened for ${a.legalName}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const completeM = useMutation({
    mutationFn: (accountId: string) => mutateCompleteReview({ data: { accountId } }),
    onSuccess: (a) => {
      toast.success(`${a.legalName} review completed — next review ${a.nextReview}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const overdue = rows.filter((r) => r.kycStatus === "overdue").length;

  return (
    <>
      <AppShell active="reviews" title="Reviews" subtitle="KYC queue">
        <PageHeader
          title="KYC review queue"
          description={
            q.isLoading
              ? "Accounts due, due soon, or under review."
              : `${rows.length} account${rows.length === 1 ? "" : "s"} need attention · ${overdue} overdue.`
          }
        />

        <Card className="overflow-hidden">
          {q.isError ? (
            <ErrorState onRetry={() => q.refetch()} label="Couldn't load the review queue." />
          ) : q.isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              label="Nothing in the queue — every account is current."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="text-left font-medium px-5 py-2.5">Account</th>
                    <th className="text-left font-medium px-3 py-2.5">Status</th>
                    <th className="text-left font-medium px-3 py-2.5">Risk</th>
                    <th className="text-left font-medium px-3 py-2.5">Next review</th>
                    <th className="text-left font-medium px-3 py-2.5">RM</th>
                    <th className="text-left font-medium px-3 py-2.5">Open</th>
                    <th className="text-right font-medium px-5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const busy =
                      (refreshM.isPending && refreshM.variables === r.id) ||
                      (completeM.isPending && completeM.variables === r.id);
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setSelectedId(r.id)}
                            className="flex items-center gap-3 text-left"
                          >
                            <AccountAvatar name={r.legalName} />
                            <div className="min-w-0">
                              <div className="font-medium truncate hover:underline">{r.legalName}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {r.id} · {r.industry}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={r.kycStatus} />
                        </td>
                        <td className="px-3 py-3">
                          <RiskMeter score={r.riskScore} level={r.riskLevel} />
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <span className={cn(r.kycStatus === "overdue" && "text-danger font-medium")}>
                            {r.nextReview}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {r.relationshipManager}
                        </td>
                        <td className="px-3 py-3 text-xs tabular-nums">
                          {r.openChanges > 0 ? (
                            <Badge variant="outline" className="text-[10px] bg-danger/10 text-danger border-danger/30">
                              {r.openChanges}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.kycStatus !== "in_review" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={busy}
                                onClick={() => refreshM.mutate(r.id)}
                              >
                                {refreshM.isPending && refreshM.variables === r.id ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <FileSearch className="w-3 h-3 mr-1" />
                                )}
                                Start
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              style={{ background: "var(--gradient-primary)" }}
                              disabled={busy}
                              onClick={() => completeM.mutate(r.id)}
                            >
                              {completeM.isPending && completeM.variables === r.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                              )}
                              Complete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </AppShell>

      <AccountDrawer accountId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
