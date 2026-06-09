import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building2, Globe2, Loader2, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { AccountDrawer } from "@/components/account-drawer";
import {
  AccountAvatar,
  EmptyState,
  ErrorState,
  fmtMoney,
  PageHeader,
  RiskMeter,
  StatusBadge,
} from "@/lib/kyc-ui";
import { fetchAccounts } from "@/lib/api/kyc.functions";
import type { RiskLevel } from "@/lib/kyc-types";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Bank al Etihad KYC" }] }),
  component: AccountsPage,
});

const RISK_FILTERS: Array<{ key: "all" | RiskLevel; label: string }> = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

const SORTS: Array<{ key: "risk" | "exposure" | "review"; label: string }> = [
  { key: "risk", label: "Risk" },
  { key: "exposure", label: "Exposure" },
  { key: "review", label: "Next review" },
];

function AccountsPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [sort, setSort] = useState<"risk" | "exposure" | "review">("risk");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = useQuery({
    queryKey: ["accounts", debounced, riskFilter, sort],
    queryFn: () => fetchAccounts({ data: { query: debounced, riskFilter, sort } }),
    placeholderData: keepPreviousData,
  });
  const data = q.data ?? [];

  return (
    <>
      <AppShell active="accounts" title="Accounts" subtitle="Corporate book">
        <PageHeader
          title="Corporate accounts"
          description="The full monitored book. Search, filter by risk, sort, and open any account for detail."
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ID, industry"
              className="h-9 pl-8 w-64"
            />
          </div>
        </PageHeader>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-1.5">
              {RISK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setRiskFilter(f.key)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    riskFilter === f.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {q.isFetching && !q.isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={cn(
                    "px-2 py-1 rounded-md border transition-colors",
                    sort === s.key
                      ? "border-primary text-primary"
                      : "border-border hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {q.isError ? (
            <ErrorState onRetry={() => q.refetch()} label="Couldn't load accounts." />
          ) : q.isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <EmptyState icon={Building2} label="No accounts match your search or filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="text-left font-medium px-5 py-2.5">Account</th>
                    <th className="text-left font-medium px-3 py-2.5">Risk</th>
                    <th className="text-left font-medium px-3 py-2.5">KYC</th>
                    <th className="text-left font-medium px-3 py-2.5">Next review</th>
                    <th className="text-left font-medium px-3 py-2.5">UBOs</th>
                    <th className="text-right font-medium px-5 py-2.5">Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <AccountAvatar name={a.legalName} />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{a.legalName}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              <span>{a.id}</span>·<span>{a.industry}</span>·
                              <Globe2 className="w-3 h-3" />
                              {a.country}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <RiskMeter score={a.riskScore} level={a.riskLevel} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={a.kycStatus} />
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className={cn(a.kycStatus === "overdue" && "text-danger font-medium")}>
                          {a.nextReview}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Last: {a.lastReview}</div>
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums">{a.uboCount}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {fmtMoney(a.exposureUSD)}
                      </td>
                    </tr>
                  ))}
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
