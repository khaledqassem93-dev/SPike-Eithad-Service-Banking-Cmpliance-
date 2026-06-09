import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Database, Globe2, Newspaper, ScrollText, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { daysAgoLabel, EmptyState, ErrorState, PageHeader, StatCard } from "@/lib/kyc-ui";
import { fetchSources } from "@/lib/api/kyc.functions";
import type { SourceFeed } from "@/lib/kyc-types";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Sources — Bank al Etihad KYC" }] }),
  component: SourcesPage,
});

const CATEGORY: Record<SourceFeed["category"], { label: string; tone: string; icon: typeof ShieldAlert }> = {
  sanctions: { label: "Sanctions / watchlist", tone: "bg-danger/10 text-danger border-danger/30", icon: ShieldAlert },
  registry: { label: "Registry / filings", tone: "bg-info/10 text-info border-info/30", icon: ScrollText },
  media: { label: "Adverse media", tone: "bg-warning/15 text-[oklch(0.5_0.12_75)] border-warning/40", icon: Newspaper },
  other: { label: "Other", tone: "bg-muted text-muted-foreground border-border", icon: Globe2 },
};

function SourcesPage() {
  const q = useQuery({ queryKey: ["sources"], queryFn: () => fetchSources() });
  const data = q.data;

  return (
    <AppShell active="sources" title="Sources" subtitle="Monitoring coverage">
      <PageHeader
        title="Monitored sources"
        description="The feeds and reference lists the screening engine watches across the corporate book."
      />

      {q.isError ? (
        <Card>
          <ErrorState onRetry={() => q.refetch()} label="Couldn't load sources." />
        </Card>
      ) : q.isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard icon={Globe2} label="Active feeds" value={data.totals.feeds} tint="primary" />
            <StatCard
              icon={ShieldAlert}
              label="Watchlist entries"
              value={data.totals.watchlistEntries}
              tint="accent"
            />
            <StatCard icon={Database} label="Total detections" value={data.totals.detections} tint="info" />
          </div>

          <div className="grid grid-cols-12 gap-6">
            <Card className="col-span-12 lg:col-span-8 overflow-hidden">
              <div className="px-5 py-3 border-b border-border text-sm font-semibold">
                Detection feeds
              </div>
              {data.feeds.length === 0 ? (
                <EmptyState label="No feeds have produced detections yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground bg-muted/20">
                      <tr>
                        <th className="text-left font-medium px-5 py-2.5">Source</th>
                        <th className="text-left font-medium px-3 py-2.5">Category</th>
                        <th className="text-right font-medium px-3 py-2.5">Detections</th>
                        <th className="text-right font-medium px-3 py-2.5">Open</th>
                        <th className="text-right font-medium px-5 py-2.5">Last signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.feeds.map((f) => {
                        const cat = CATEGORY[f.category];
                        const Icon = cat.icon;
                        return (
                          <tr key={f.name} className="border-t border-border">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={cn(
                                    "w-7 h-7 rounded-md grid place-items-center border shrink-0",
                                    cat.tone,
                                  )}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                </span>
                                <span className="font-medium">{f.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant="outline" className={cn("text-[10px]", cat.tone)}>
                                {cat.label}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{f.detections}</td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {f.open > 0 ? (
                                <span className="text-danger font-medium">{f.open}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                              {f.lastDetected ? daysAgoLabel(f.lastDetected) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="col-span-12 lg:col-span-4 p-5">
              <div className="text-sm font-semibold mb-1">Reference watchlists</div>
              <div className="text-xs text-muted-foreground mb-3">
                Lists screened against every beneficial owner.
              </div>
              <ul className="space-y-2">
                {data.watchlists.map((w) => (
                  <li
                    key={w.listSource}
                    className="flex items-center justify-between p-2.5 rounded-md border border-border"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <ShieldAlert className="w-3.5 h-3.5 text-accent" />
                      {w.listSource}
                    </div>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {w.entries} {w.entries === 1 ? "entry" : "entries"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
