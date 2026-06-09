import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSearch,
  Filter,
  Gavel,
  Globe2,
  LayoutDashboard,
  Loader2,
  MapPin,
  Newspaper,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip as UTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EtihadMark } from "@/components/EtihadLogo";
import { AppShell } from "@/components/app-shell";
import type {
  ChangeType,
  CorporateAccount,
  DashboardStats,
  KycStatus,
  LiveFeedItem,
  RiskLevel,
  TrendWindow,
  Ubo,
} from "@/lib/kyc-types";
import {
  fetchAccount,
  fetchAccounts,
  fetchAiInsights,
  fetchDashboardStats,
  fetchDetectionTrend,
  fetchLiveFeed,
  fetchReviewQueue,
  fetchRiskDistribution,
  mutateAcknowledgeChange,
  mutateEscalateAccount,
  mutateRunScreening,
  mutateStartKycRefresh,
  mutateStartTriage,
} from "@/lib/api/kyc.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Corporate KYC Watch — Bank al Etihad" },
      {
        name: "description",
        content:
          "Bank al Etihad Corporate KYC Watch — detect ownership, sanctions and adverse-media changes across the corporate book and trigger timely KYC refresh cycles.",
      },
    ],
  }),
  component: Dashboard,
});

/* ---------------- helpers ---------------- */

const riskTone: Record<RiskLevel, string> = {
  low: "bg-risk-low/15 text-risk-low border-risk-low/30",
  medium: "bg-risk-medium/20 text-[oklch(0.5_0.12_75)] border-risk-medium/40",
  high: "bg-risk-high/15 text-risk-high border-risk-high/30",
  critical: "bg-risk-critical/15 text-risk-critical border-risk-critical/40",
};

const riskVar: Record<RiskLevel, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
  critical: "var(--risk-critical)",
};

const statusTone: Record<KycStatus, string> = {
  current: "bg-success/15 text-success border-success/30",
  due_soon: "bg-warning/20 text-[oklch(0.5_0.12_75)] border-warning/40",
  overdue: "bg-danger/15 text-danger border-danger/40",
  in_review: "bg-info/15 text-info border-info/30",
};

const statusLabel: Record<KycStatus, string> = {
  current: "Current",
  due_soon: "Due Soon",
  overdue: "Overdue",
  in_review: "In Review",
};

const changeIcon: Record<ChangeType, React.ElementType> = {
  ownership: Users,
  directors: Users,
  address: MapPin,
  sanctions: ShieldAlert,
  litigation: Gavel,
  financials: TrendingUp,
  industry: Building2,
  media: Newspaper,
};

const fmtMoney = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`;

function daysAgoLabel(iso: string): string {
  const then = new Date(iso + "T00:00:00Z").getTime();
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/* ---------------- small states ---------------- */

function ErrorState({ onRetry, label }: { onRetry: () => void; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <AlertCircle className="h-5 w-5 text-danger" />
      <div className="text-sm text-muted-foreground">{label ?? "Couldn't load this data."}</div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/* ---------------- main ---------------- */

function Dashboard() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("7d");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const statsQ = useQuery({ queryKey: ["stats"], queryFn: () => fetchDashboardStats() });
  const accountsQ = useQuery({
    queryKey: ["accounts", debouncedQuery, riskFilter],
    queryFn: () => fetchAccounts({ data: { query: debouncedQuery, riskFilter } }),
    placeholderData: keepPreviousData,
  });
  const trendQ = useQuery({
    queryKey: ["trend", trendWindow],
    queryFn: () => fetchDetectionTrend({ data: { window: trendWindow } }),
  });
  const distQ = useQuery({ queryKey: ["distribution"], queryFn: () => fetchRiskDistribution() });
  const feedQ = useQuery({ queryKey: ["liveFeed"], queryFn: () => fetchLiveFeed() });
  const queueQ = useQuery({ queryKey: ["reviewQueue"], queryFn: () => fetchReviewQueue() });
  const insightsQ = useQuery({ queryKey: ["insights"], queryFn: () => fetchAiInsights() });
  const accountQ = useQuery({
    queryKey: ["account", selectedId],
    queryFn: () => fetchAccount({ data: { id: selectedId as string } }),
    enabled: !!selectedId,
  });

  function invalidateAll() {
    for (const k of ["stats", "accounts", "trend", "distribution", "liveFeed", "reviewQueue", "insights"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
    if (selectedId) qc.invalidateQueries({ queryKey: ["account", selectedId] });
  }

  const triageM = useMutation({
    mutationFn: () => mutateStartTriage(),
    onSuccess: (d) => {
      toast.success(`Triage started — ${d.queued} priority account${d.queued === 1 ? "" : "s"} queued`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const refreshM = useMutation({
    mutationFn: (accountId: string) => mutateStartKycRefresh({ data: { accountId } }),
    onSuccess: (a) => {
      toast.success(`KYC refresh opened for ${a.legalName}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const escalateM = useMutation({
    mutationFn: (accountId: string) =>
      mutateEscalateAccount({ data: { accountId, note: "Escalated for enhanced due diligence" } }),
    onSuccess: (a) => {
      toast.success(`${a.legalName} escalated to EDD`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ackM = useMutation({
    mutationFn: (changeId: string) => mutateAcknowledgeChange({ data: { changeId } }),
    onSuccess: () => {
      toast.success("Change acknowledged");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const screenM = useMutation({
    mutationFn: (accountId: string) => mutateRunScreening({ data: { accountId } }),
    onSuccess: (a) => {
      toast.success(`Re-screened ${a.legalName} — risk ${a.riskScore}/100 (${a.riskLevel})`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = statsQ.data;
  const accounts = accountsQ.data ?? [];

  return (
    <>
      <AppShell active="overview" title="Overview" subtitle="Corporate accounts">
            <Hero stats={stats} loading={statsQ.isLoading} onTriage={() => triageM.mutate()} triaging={triageM.isPending} />

            <div className="grid grid-cols-12 gap-6">
              <DetectionTrendCard
                data={trendQ.data}
                loading={trendQ.isLoading}
                error={trendQ.isError}
                onRetry={() => trendQ.refetch()}
                window={trendWindow}
                setWindow={setTrendWindow}
              />
              <RiskMixCard
                data={distQ.data}
                total={stats?.monitoredAccounts}
                loading={distQ.isLoading}
                error={distQ.isError}
                onRetry={() => distQ.refetch()}
              />
              <AIInsightCard
                insights={insightsQ.data}
                loading={insightsQ.isLoading}
                error={insightsQ.isError}
                onRetry={() => insightsQ.refetch()}
              />
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8 space-y-6">
                <AccountsTable
                  data={accounts}
                  totalCount={stats?.monitoredAccounts}
                  loading={accountsQ.isLoading}
                  fetching={accountsQ.isFetching}
                  error={accountsQ.isError}
                  onRetry={() => accountsQ.refetch()}
                  query={query}
                  setQuery={setQuery}
                  riskFilter={riskFilter}
                  setRiskFilter={setRiskFilter}
                  onSelect={(a) => setSelectedId(a.id)}
                />
              </div>
              <div className="col-span-12 lg:col-span-4 space-y-6">
                <LiveFeed
                  items={feedQ.data}
                  loading={feedQ.isLoading}
                  error={feedQ.isError}
                  onRetry={() => feedQ.refetch()}
                  onSelect={setSelectedId}
                />
                <ReviewQueue
                  items={queueQ.data}
                  loading={queueQ.isLoading}
                  error={queueQ.isError}
                  onRetry={() => queueQ.refetch()}
                  onSelect={setSelectedId}
                />
              </div>
            </div>

            <footer className="text-xs text-muted-foreground text-center py-4">
              Bank al Etihad · Corporate KYC Watch · AI-assisted monitoring · Decisions remain with the compliance officer.
            </footer>
      </AppShell>

      <AccountDrawer
        account={accountQ.data ?? null}
        loading={!!selectedId && accountQ.isLoading}
        onClose={() => setSelectedId(null)}
        onRefresh={(id) => refreshM.mutate(id)}
        onEscalate={(id) => escalateM.mutate(id)}
        onScreen={(id) => screenM.mutate(id)}
        onAck={(id) => ackM.mutate(id)}
        refreshing={refreshM.isPending}
        escalating={escalateM.isPending}
        screening={screenM.isPending}
        ackingId={ackM.isPending ? ackM.variables : undefined}
      />
    </>
  );
}

/* ---------------- nav ---------------- */

function SideNav({ stats, reviewCount }: { stats?: DashboardStats; reviewCount?: number }) {
  const items: Array<{ icon: React.ElementType; label: string; active?: boolean; badge?: number }> = [
    { icon: LayoutDashboard, label: "Overview", active: true },
    { icon: Building2, label: "Accounts" },
    { icon: ShieldAlert, label: "Alerts", badge: stats?.critical },
    { icon: FileSearch, label: "Reviews", badge: reviewCount },
    { icon: Activity, label: "Detections" },
    { icon: Globe2, label: "Sources" },
    { icon: Settings, label: "Settings" },
  ];
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-5 py-5 flex items-center gap-2.5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg grid place-items-center bg-white shadow-sm">
          <EtihadMark className="w-6 h-6" />
        </div>
        <div>
          <div className="font-semibold leading-tight">Bank al Etihad</div>
          <div className="text-[11px] text-sidebar-foreground/60">Corporate KYC Watch</div>
        </div>
      </div>
      <nav className="p-3 space-y-1">
        {items.map((it) => (
          <button
            key={it.label}
            onClick={() => {
              if (!it.active) toast.info(`${it.label} isn't built yet — Overview is the live dashboard.`);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              it.active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <it.icon className="w-4 h-4" />
            <span className="flex-1 text-left">{it.label}</span>
            {it.active ? null : <span className="text-[9px] uppercase tracking-wide opacity-50">soon</span>}
            {typeof it.badge === "number" && it.badge > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
                {it.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-lg p-3 bg-sidebar-accent/50 border border-sidebar-border">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-sidebar-primary" />
            Etihad Sentinel AI
          </div>
          <div className="mt-1 text-[11px] text-sidebar-foreground/60">
            {stats ? `${stats.sourcesMonitored} sources monitored · last sync ${daysAgoLabel(stats.lastSync)}` : "Syncing sources…"}
          </div>
          <div className="mt-2 h-1 rounded-full bg-sidebar-border overflow-hidden">
            <div className="h-full w-[82%]" style={{ background: "var(--gradient-accent)" }} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ stats }: { stats?: DashboardStats }) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-border">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center gap-3">
        <div className="md:hidden flex items-center gap-2">
          <EtihadMark className="w-5 h-5" />
          <span className="font-semibold">al Etihad</span>
        </div>
        <div className="hidden md:block text-sm text-muted-foreground">
          <span className="text-foreground font-medium">Overview</span>
          <ChevronRight className="inline w-3.5 h-3.5 mx-1 opacity-50" />
          Corporate accounts
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md bg-success/10 text-success border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            {stats ? `Live · monitoring ${stats.monitoredAccounts} accounts` : "Connecting…"}
          </div>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-4 h-4" />
            {stats && stats.critical > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />
            )}
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
  );
}

/* ---------------- hero / KPIs ---------------- */

function Hero({
  stats,
  loading,
  onTriage,
  triaging,
}: {
  stats?: DashboardStats;
  loading: boolean;
  onTriage: () => void;
  triaging: boolean;
}) {
  return (
    <section className="grid grid-cols-12 gap-6">
      <Card
        className="col-span-12 lg:col-span-5 p-6 relative overflow-hidden border-0 text-primary-foreground"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div
          className="absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-20"
          style={{ background: "var(--gradient-accent)" }}
        />
        <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/15">
          <Sparkles className="w-3 h-3 mr-1" /> AI Briefing · Today
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {loading || !stats
            ? "Compiling today's risk briefing…"
            : `${stats.critical} critical · ${stats.overdue} overdue accounts need attention`}
        </h1>
        <p className="mt-2 text-sm text-white/75 leading-relaxed">
          The screening engine flagged sanctions, ownership and adverse-media changes across the highest-risk
          accounts.{" "}
          {stats && (
            <>
              <span className="font-medium text-white">{stats.totalChanges}</span> open detections in the last 7
              days.
            </>
          )}
        </p>
        <div className="mt-5 flex items-center gap-2">
          <Button className="bg-white text-primary hover:bg-white/90" onClick={onTriage} disabled={triaging || !stats}>
            {triaging ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Start triage
          </Button>
        </div>
      </Card>

      <div className="col-span-12 lg:col-span-7 grid grid-cols-2 grid-rows-2 gap-4">
        {loading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-full min-h-[116px] rounded-xl" />)
        ) : (
          <>
            <KpiCard icon={Zap} label="Detections (7d)" value={stats.totalChanges.toString()} delta="+18%" up tint="accent" />
            <KpiCard icon={ShieldAlert} label="Critical accounts" value={stats.critical.toString()} delta="+1" up tint="danger" />
            <KpiCard icon={Clock} label="KYC overdue" value={stats.overdue.toString()} delta="-2" up={false} tint="warning" />
            <KpiCard icon={Wallet} label="Exposure monitored" value={fmtMoney(stats.exposure)} delta="+3.4%" up tint="info" />
          </>
        )}
      </div>
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  up,
  tint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  delta: string;
  up: boolean;
  tint: "accent" | "danger" | "warning" | "info";
}) {
  const bg: Record<typeof tint, string> = {
    accent: "bg-accent/15 text-accent",
    danger: "bg-danger/15 text-danger",
    warning: "bg-warning/20 text-[oklch(0.5_0.12_75)]",
    info: "bg-info/15 text-info",
  };
  return (
    <Card className="p-4 border-border/60 hover:shadow-[var(--shadow-soft)] transition-shadow h-full flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between">
        <div className={cn("w-9 h-9 rounded-lg grid place-items-center", bg[tint])}>
          <Icon className="w-4 h-4" />
        </div>
        <span className={cn("text-xs flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {delta}
        </span>
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight leading-none">{value}</div>
        <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

/* ---------------- charts ---------------- */

function DetectionTrendCard({
  data,
  loading,
  error,
  onRetry,
  window,
  setWindow,
}: {
  data?: Array<{ day: string; critical: number; high: number; medium: number; low: number }>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  window: TrendWindow;
  setWindow: (w: TrendWindow) => void;
}) {
  return (
    <Card className="col-span-12 lg:col-span-6 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">Change detections</div>
          <div className="text-xs text-muted-foreground">Stacked by severity, from the live detection log.</div>
        </div>
        <Tabs value={window} onValueChange={(v) => setWindow(v as TrendWindow)}>
          <TabsList className="h-8">
            <TabsTrigger value="7d" className="text-xs h-6">7D</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs h-6">30D</TabsTrigger>
            <TabsTrigger value="90d" className="text-xs h-6">90D</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="h-[240px]">
        {error ? (
          <ErrorState onRetry={onRetry} />
        ) : loading || !data ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {(["critical", "high", "medium", "low"] as RiskLevel[]).map((lvl) => (
                  <linearGradient key={lvl} id={`g-${lvl}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={riskVar[lvl]} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={riskVar[lvl]} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
              />
              <Area type="monotone" dataKey="low" stackId="1" stroke={riskVar.low} fill="url(#g-low)" />
              <Area type="monotone" dataKey="medium" stackId="1" stroke={riskVar.medium} fill="url(#g-medium)" />
              <Area type="monotone" dataKey="high" stackId="1" stroke={riskVar.high} fill="url(#g-high)" />
              <Area type="monotone" dataKey="critical" stackId="1" stroke={riskVar.critical} fill="url(#g-critical)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function RiskMixCard({
  data,
  total,
  loading,
  error,
  onRetry,
}: {
  data?: Array<{ name: string; value: number; level: RiskLevel }>;
  total?: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="col-span-12 md:col-span-6 lg:col-span-3 p-5">
      <div className="text-sm font-semibold">Portfolio risk mix</div>
      <div className="text-xs text-muted-foreground mb-2">{total ?? "—"} corporate accounts</div>
      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : loading || !data ? (
        <Skeleton className="h-[150px] w-full rounded-lg" />
      ) : (
        <>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={42} outerRadius={60} paddingAngle={3}>
                  {data.map((e) => (
                    <Cell key={e.level} fill={riskVar[e.level]} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {data.map((r) => (
              <div key={r.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm" style={{ background: riskVar[r.level] }} />
                  <span className="text-muted-foreground">{r.name}</span>
                </div>
                <span className="font-medium tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function AIInsightCard({
  insights,
  loading,
  error,
  onRetry,
}: {
  insights?: Array<{ tone: "danger" | "warning" | "info"; icon: "sanctions" | "ownership" | "media"; text: string }>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const iconFor = { sanctions: ShieldAlert, ownership: Users, media: Newspaper } as const;
  return (
    <Card className="col-span-12 md:col-span-6 lg:col-span-3 p-5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-50 pointer-events-none" style={{ background: "var(--gradient-surface)" }} />
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="w-4 h-4 text-accent" />
          AI insights
        </div>
        <div className="text-[11px] text-muted-foreground mb-3">Computed from current signals</div>
        {error ? (
          <ErrorState onRetry={onRetry} />
        ) : loading || !insights ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {insights.map((i, idx) => {
              const Icon = iconFor[i.icon];
              return (
                <li key={idx} className="flex gap-2 text-xs leading-snug">
                  <Icon
                    className={cn(
                      "w-3.5 h-3.5 shrink-0 mt-0.5",
                      i.tone === "danger" && "text-danger",
                      i.tone === "warning" && "text-[oklch(0.5_0.12_75)]",
                      i.tone === "info" && "text-info",
                    )}
                  />
                  <span>{i.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---------------- accounts table ---------------- */

function AccountsTable({
  data,
  totalCount,
  loading,
  fetching,
  error,
  onRetry,
  query,
  setQuery,
  riskFilter,
  setRiskFilter,
  onSelect,
}: {
  data: CorporateAccount[];
  totalCount?: number;
  loading: boolean;
  fetching: boolean;
  error: boolean;
  onRetry: () => void;
  query: string;
  setQuery: (s: string) => void;
  riskFilter: "all" | RiskLevel;
  setRiskFilter: (r: "all" | RiskLevel) => void;
  onSelect: (a: CorporateAccount) => void;
}) {
  const filters: Array<{ key: "all" | RiskLevel; label: string }> = [
    { key: "all", label: "All" },
    { key: "critical", label: "Critical" },
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="p-5 flex flex-wrap items-center gap-3 border-b border-border">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            Corporate accounts
            {fetching && !loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.length} of {totalCount ?? data.length} shown · sorted by risk
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ID, industry"
              className="h-9 pl-8 w-64"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9">
            <Filter className="w-3.5 h-3.5 mr-1.5" /> Filters
          </Button>
        </div>
      </div>

      <div className="px-5 py-2.5 flex items-center gap-1.5 border-b border-border bg-muted/30">
        {filters.map((f) => (
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

      {error ? (
        <ErrorState onRetry={onRetry} label="Couldn't load accounts." />
      ) : loading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No accounts match your search or filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/20">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Account</th>
                <th className="text-left font-medium px-3 py-2.5">Risk</th>
                <th className="text-left font-medium px-3 py-2.5">KYC</th>
                <th className="text-left font-medium px-3 py-2.5">Next review</th>
                <th className="text-left font-medium px-3 py-2.5">Changes</th>
                <th className="text-right font-medium px-5 py-2.5">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a)}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-md grid place-items-center text-xs font-semibold text-primary-foreground"
                        style={{ background: "var(--gradient-primary)" }}
                      >
                        {a.legalName.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                      </div>
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
                    <Badge variant="outline" className={cn("text-[10px] font-medium", statusTone[a.kycStatus])}>
                      {statusLabel[a.kycStatus]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className={cn(a.kycStatus === "overdue" && "text-danger font-medium")}>{a.nextReview}</div>
                    <div className="text-[10px] text-muted-foreground">Last: {a.lastReview}</div>
                  </td>
                  <td className="px-3 py-3">
                    {a.changes.length === 0 ? (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-success" /> No deltas
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        {a.changes.slice(0, 3).map((c) => {
                          const Icon = changeIcon[c.type];
                          return (
                            <UTooltip key={c.id}>
                              <TooltipTrigger asChild>
                                <span className={cn("w-6 h-6 rounded grid place-items-center border", riskTone[c.severity])}>
                                  <Icon className="w-3 h-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="text-xs font-medium capitalize">{c.type} · {c.severity}</div>
                                <div className="text-[11px] opacity-80">{c.summary}</div>
                              </TooltipContent>
                            </UTooltip>
                          );
                        })}
                        {a.changes.length > 3 && (
                          <span className="text-[10px] text-muted-foreground ml-1">+{a.changes.length - 3}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtMoney(a.exposureUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RiskMeter({ score, level }: { score: number; level: RiskLevel }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: riskVar[level] }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8">{score}</span>
      <Badge variant="outline" className={cn("text-[10px] capitalize", riskTone[level])}>
        {level}
      </Badge>
    </div>
  );
}

/* ---------------- live feed + queue ---------------- */

function LiveFeed({
  items,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  items?: LiveFeedItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Live detection feed
          </div>
          <div className="text-xs text-muted-foreground">AI-flagged events across your book</div>
        </div>
      </div>
      <ScrollArea className="h-[300px] pr-3">
        {error ? (
          <ErrorState onRetry={onRetry} />
        ) : loading || !items ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">No recent detections.</div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((it) => {
              const Icon = changeIcon[it.type];
              return (
                <li key={it.changeId}>
                  <button
                    onClick={() => onSelect(it.accountId)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn("w-8 h-8 rounded-md grid place-items-center border shrink-0", riskTone[it.severity])}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{it.legalName}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{daysAgoLabel(it.detectedAt)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{it.summary}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className={cn("text-[10px] capitalize", riskTone[it.severity])}>
                            {it.type}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">confidence {it.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </Card>
  );
}

function ReviewQueue({
  items,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  items?: Array<{ id: string; legalName: string; kycStatus: KycStatus; nextReview: string; relationshipManager: string }>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">KYC review queue</div>
          <div className="text-xs text-muted-foreground">Sorted by due date</div>
        </div>
        <Badge variant="outline" className="text-[10px]">{items?.length ?? 0} pending</Badge>
      </div>
      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : loading || !items ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Queue is clear.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onSelect(a.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/60 transition-colors text-left"
              >
                <div
                  className={cn(
                    "w-1 h-8 rounded-full",
                    a.kycStatus === "overdue" ? "bg-danger" : a.kycStatus === "in_review" ? "bg-info" : "bg-warning",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{a.legalName}</div>
                  <div className="text-[10px] text-muted-foreground">Due {a.nextReview} · RM {a.relationshipManager}</div>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", statusTone[a.kycStatus])}>
                  {statusLabel[a.kycStatus]}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- drawer ---------------- */

function AccountDrawer({
  account,
  loading,
  onClose,
  onRefresh,
  onEscalate,
  onScreen,
  onAck,
  refreshing,
  escalating,
  screening,
  ackingId,
}: {
  account: (CorporateAccount & { ubos: Ubo[] }) | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: (id: string) => void;
  onEscalate: (id: string) => void;
  onScreen: (id: string) => void;
  onAck: (id: string) => void;
  refreshing: boolean;
  escalating: boolean;
  screening: boolean;
  ackingId?: string;
}) {
  const open = loading || !!account;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[88vh] overflow-y-auto gap-0">
        {loading && !account ? (
          <>
            <DialogHeader className="pr-6">
              <DialogTitle>Loading account…</DialogTitle>
              <DialogDescription className="text-xs">Fetching the latest KYC profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-6">
              <Skeleton className="h-12 w-2/3 rounded" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </>
        ) : account ? (
          <>
            <DialogHeader className="pr-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-md grid place-items-center text-sm font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {account.legalName.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                </div>
                <div className="min-w-0 text-left">
                  <DialogTitle className="truncate">{account.legalName}</DialogTitle>
                  <DialogDescription className="text-xs">
                    {account.id} · {account.industry} · {account.jurisdiction}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile label="Risk score" value={account.riskScore.toString()} sub={account.riskLevel} tone="primary" />
              <StatTile label="AI confidence" value={`${account.aiConfidence}%`} sub="Etihad Sentinel AI" tone="accent" />
              <StatTile label="Exposure" value={fmtMoney(account.exposureUSD)} sub={`${account.accountsHeld} accounts`} />
              <StatTile label="UBOs" value={account.uboCount.toString()} sub="beneficial owners" />
            </div>

            {account.ubos.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold mb-2">Beneficial owners</div>
                <ul className="space-y-1.5">
                  {account.ubos.map((u) => (
                    <li key={u.id} className="flex items-center justify-between text-xs p-2 rounded-md border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium">{u.name}</span>
                        {u.isPep && (
                          <Badge variant="outline" className="text-[9px] bg-warning/20 text-[oklch(0.5_0.12_75)] border-warning/40">PEP</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                        <span>{u.nationality}</span>
                        <span className={cn("tabular-nums font-medium", u.ownershipPct >= 25 && "text-risk-high")}>
                          {u.ownershipPct.toFixed(1)}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5">
              <div className="text-xs font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                AI-generated review summary
              </div>
              <div className="text-xs leading-relaxed p-3.5 rounded-lg border border-border bg-muted/30">
                {account.changes.length === 0
                  ? "No material changes detected since last review. Risk posture remains stable across monitored signals."
                  : `Detected ${account.changes.length} significant change${account.changes.length > 1 ? "s" : ""} across ${
                      new Set(account.changes.map((c) => c.type)).size
                    } categor${account.changes.length > 1 ? "ies" : "y"}. ${
                      account.changes.some((c) => c.severity === "critical")
                        ? "Recommend immediate enhanced due diligence and SAR consideration."
                        : "Recommend a refreshed KYC packet within the next review window."
                    }`}
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs font-semibold mb-2">KYC refresh progress</div>
              <Progress
                value={
                  account.kycStatus === "current" ? 100 : account.kycStatus === "in_review" ? 60 : account.kycStatus === "due_soon" ? 30 : 10
                }
                className="h-2"
              />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>Identification</span><span>Verification</span><span>Risk assessment</span><span>Approval</span>
              </div>
            </div>

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
                          <span className={cn("w-7 h-7 rounded-md grid place-items-center border shrink-0", riskTone[c.severity])}>
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium capitalize">{c.type}</span>
                              <Badge variant="outline" className={cn("text-[10px] capitalize", riskTone[c.severity])}>
                                {c.severity}
                              </Badge>
                              {c.status !== "open" && (
                                <Badge variant="outline" className="text-[10px] capitalize bg-muted text-muted-foreground">
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
                                  <div className="text-[9px] uppercase text-muted-foreground tracking-wide mb-0.5">Before</div>
                                  {c.before}
                                </div>
                                <div className="p-2 rounded bg-accent/10 border border-accent/30">
                                  <div className="text-[9px] uppercase text-accent tracking-wide mb-0.5">After</div>
                                  {c.after}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              <div className="text-[10px] text-muted-foreground">Source: {c.source}</div>
                              {c.status === "open" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px]"
                                  onClick={() => onAck(c.id)}
                                  disabled={ackingId === c.id}
                                >
                                  {ackingId === c.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                  Acknowledge
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

            <div className="mt-5 flex flex-wrap gap-2 sticky bottom-0 bg-background pt-3 pb-1 -mx-6 px-6 border-t border-border">
              <Button
                className="flex-1 min-w-[140px]"
                style={{ background: "var(--gradient-primary)" }}
                onClick={() => onRefresh(account.id)}
                disabled={refreshing || account.kycStatus === "in_review"}
              >
                {refreshing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSearch className="w-4 h-4 mr-1.5" />}
                {account.kycStatus === "in_review" ? "In review" : "Start KYC refresh"}
              </Button>
              <Button variant="outline" onClick={() => onScreen(account.id)} disabled={screening}>
                {screening ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                Re-screen
              </Button>
              <Button variant="outline" onClick={() => onEscalate(account.id)} disabled={escalating}>
                {escalating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-1.5" />}
                Escalate
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

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
      <div className={cn("text-xl font-semibold mt-0.5", tone === "accent" && "text-accent")}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground capitalize">{sub}</div>}
    </div>
  );
}
