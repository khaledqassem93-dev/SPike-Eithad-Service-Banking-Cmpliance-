import { type ElementType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Building2,
  ChevronRight,
  FileSearch,
  Globe2,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EtihadMark } from "@/components/EtihadLogo";
import { daysAgoLabel } from "@/lib/kyc-ui";
import { fetchDashboardStats, fetchReviewQueue } from "@/lib/api/kyc.functions";

export type Section =
  | "overview"
  | "accounts"
  | "alerts"
  | "reviews"
  | "detections"
  | "sources"
  | "settings";

const NAV: Array<{ key: Section; label: string; icon: ElementType; to: string }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, to: "/" },
  { key: "accounts", label: "Accounts", icon: Building2, to: "/accounts" },
  { key: "alerts", label: "Alerts", icon: ShieldAlert, to: "/alerts" },
  { key: "reviews", label: "Reviews", icon: FileSearch, to: "/reviews" },
  { key: "detections", label: "Detections", icon: Activity, to: "/detections" },
  { key: "sources", label: "Sources", icon: Globe2, to: "/sources" },
  { key: "settings", label: "Settings", icon: Settings, to: "/settings" },
];

export function AppShell({
  active,
  title,
  subtitle,
  children,
}: {
  active: Section;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  // Shared across pages; these query keys are reused by the pages themselves,
  // so TanStack Query dedupes — no extra fetches.
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: () => fetchDashboardStats() });
  const queueQ = useQuery({ queryKey: ["reviewQueue"], queryFn: () => fetchReviewQueue() });
  const stats = statsQ.data;
  const badges: Partial<Record<Section, number | undefined>> = {
    alerts: stats?.critical,
    reviews: queueQ.data?.length,
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background text-foreground flex">
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen">
          <div className="px-5 py-5 flex items-center gap-2.5 border-b border-sidebar-border">
            <div className="w-9 h-9 rounded-lg grid place-items-center bg-white text-[#0f1a2e] shadow-sm">
              <EtihadMark className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold leading-tight">Bank al Etihad</div>
              <div className="text-[11px] text-sidebar-foreground/70">Corporate KYC Watch</div>
            </div>
          </div>
          <nav className="p-3 space-y-1 overflow-y-auto">
            {NAV.map((it) => {
              const isActive = it.key === active;
              const badge = badges[it.key];
              return (
                <Link
                  key={it.key}
                  to={it.to}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <it.icon className={cn("w-4 h-4 shrink-0", isActive && "text-accent")} />
                  <span className="flex-1 text-left">{it.label}</span>
                  {typeof badge === "number" && badge > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto p-4">
            <div className="rounded-lg p-3 bg-sidebar-accent/50 border border-sidebar-border">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5 text-sidebar-primary" />
                Etihad Sentinel AI
              </div>
              <div className="mt-1 text-[11px] text-sidebar-foreground/70">
                {stats
                  ? `${stats.sourcesMonitored} sources monitored · last sync ${daysAgoLabel(stats.lastSync)}`
                  : "Syncing sources…"}
              </div>
              <div className="mt-2 h-1 rounded-full bg-sidebar-border overflow-hidden">
                <div className="h-full w-[82%]" style={{ background: "var(--gradient-accent)" }} />
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-border">
            <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center gap-3">
              <Link to="/" className="md:hidden flex items-center gap-2">
                <EtihadMark className="w-5 h-5" />
                <span className="font-semibold">al Etihad</span>
              </Link>
              <div className="hidden md:block text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{title}</span>
                {subtitle && (
                  <>
                    <ChevronRight className="inline w-3.5 h-3.5 mx-1 opacity-50" />
                    {subtitle}
                  </>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md bg-success/10 text-success border border-success/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  {stats ? `Live · monitoring ${stats.monitoredAccounts} accounts` : "Connecting…"}
                </div>
                <Button variant="ghost" size="icon" className="relative" asChild>
                  <Link to="/alerts">
                    <Bell className="w-4 h-4" />
                    {stats && stats.critical > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />
                    )}
                  </Link>
                </Button>
                <div
                  className="w-8 h-8 rounded-full grid place-items-center text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  AO
                </div>
              </div>
            </div>
          </header>
          <div className="p-6 space-y-6 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
