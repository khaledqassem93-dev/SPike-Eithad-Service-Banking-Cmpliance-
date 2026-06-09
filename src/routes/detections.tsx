import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Activity, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { AccountDrawer } from "@/components/account-drawer";
import {
  ChangeStatusBadge,
  changeIcon,
  daysAgoLabel,
  EmptyState,
  ErrorState,
  PageHeader,
  riskTone,
} from "@/lib/kyc-ui";
import { fetchDetections } from "@/lib/api/kyc.functions";
import type { ChangeStatus, ChangeType, RiskLevel, TrendWindow } from "@/lib/kyc-types";

export const Route = createFileRoute("/detections")({
  head: () => ({ meta: [{ title: "Detections — Bank al Etihad KYC" }] }),
  component: DetectionsPage,
});

const TYPES: Array<ChangeType | "all"> = [
  "all",
  "sanctions",
  "ownership",
  "directors",
  "media",
  "litigation",
  "financials",
  "address",
  "industry",
];
const SEVERITIES: Array<RiskLevel | "all"> = ["all", "critical", "high", "medium", "low"];
const STATUSES: Array<ChangeStatus | "all"> = ["all", "open", "acknowledged", "resolved"];
const WINDOWS: Array<TrendWindow | "all"> = ["all", "7d", "30d", "90d"];

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border capitalize transition-colors",
            value === o
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function DetectionsPage() {
  const [type, setType] = useState<ChangeType | "all">("all");
  const [severity, setSeverity] = useState<RiskLevel | "all">("all");
  const [status, setStatus] = useState<ChangeStatus | "all">("all");
  const [windowSel, setWindowSel] = useState<TrendWindow | "all">("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = useQuery({
    queryKey: ["detections", type, severity, status, windowSel, debounced],
    queryFn: () =>
      fetchDetections({
        data: { type, severity, status, window: windowSel, query: debounced },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = q.data ?? [];

  return (
    <>
      <AppShell active="detections" title="Detections" subtitle="Change log">
        <PageHeader
          title="Detection log"
          description="Every change the screening engine and ingested sources have produced across the book."
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search account, summary, source"
              className="h-9 pl-8 w-72"
            />
          </div>
        </PageHeader>

        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-14">Type</span>
              <Chips options={TYPES} value={type} onChange={setType} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-14">Severity</span>
              <Chips options={SEVERITIES} value={severity} onChange={setSeverity} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status</span>
              <Chips options={STATUSES} value={status} onChange={setStatus} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Window</span>
              <Chips options={WINDOWS} value={windowSel} onChange={setWindowSel} />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Activity className="w-4 h-4 text-accent" />
            {q.isLoading ? "Detections" : `${rows.length} detection${rows.length === 1 ? "" : "s"}`}
            {q.isFetching && !q.isLoading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {q.isError ? (
            <ErrorState onRetry={() => q.refetch()} label="Couldn't load detections." />
          ) : q.isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Activity} label="No detections match these filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="text-left font-medium px-5 py-2.5">Account / change</th>
                    <th className="text-left font-medium px-3 py-2.5">Type</th>
                    <th className="text-left font-medium px-3 py-2.5">Severity</th>
                    <th className="text-left font-medium px-3 py-2.5">Source</th>
                    <th className="text-left font-medium px-3 py-2.5">Detected</th>
                    <th className="text-left font-medium px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const Icon = changeIcon[c.type];
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedId(c.accountId)}
                        className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 max-w-[420px]">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={cn(
                                "w-7 h-7 rounded-md grid place-items-center border shrink-0 mt-0.5",
                                riskTone[c.severity],
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{c.legalName}</div>
                              <div className="text-[11px] text-muted-foreground line-clamp-1">
                                {c.summary}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs capitalize">{c.type}</td>
                        <td className="px-3 py-3">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] capitalize", riskTone[c.severity])}
                          >
                            {c.severity}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-muted-foreground max-w-[160px] truncate">
                          {c.source}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {daysAgoLabel(c.detectedAt)}
                        </td>
                        <td className="px-5 py-3">
                          <ChangeStatusBadge status={c.status} />
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
