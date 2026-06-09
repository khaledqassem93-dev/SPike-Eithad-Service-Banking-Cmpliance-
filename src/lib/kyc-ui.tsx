import { type ElementType, type ReactNode } from "react";
import {
  AlertCircle,
  Building2,
  Gavel,
  MapPin,
  Newspaper,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChangeStatus, ChangeType, KycStatus, RiskLevel } from "@/lib/kyc-types";

// Shared presentation helpers + small components used by the dashboard, the
// account drawer, and every section page. Single source of truth for the
// Bank al Etihad risk/status colour language.

export const riskTone: Record<RiskLevel, string> = {
  low: "bg-risk-low/15 text-risk-low border-risk-low/30",
  medium: "bg-risk-medium/20 text-[oklch(0.5_0.12_75)] border-risk-medium/40",
  high: "bg-risk-high/15 text-risk-high border-risk-high/30",
  critical: "bg-risk-critical/15 text-risk-critical border-risk-critical/40",
};

export const riskVar: Record<RiskLevel, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
  critical: "var(--risk-critical)",
};

export const statusTone: Record<KycStatus, string> = {
  current: "bg-success/15 text-success border-success/30",
  due_soon: "bg-warning/20 text-[oklch(0.5_0.12_75)] border-warning/40",
  overdue: "bg-danger/15 text-danger border-danger/40",
  in_review: "bg-info/15 text-info border-info/30",
};

export const statusLabel: Record<KycStatus, string> = {
  current: "Current",
  due_soon: "Due Soon",
  overdue: "Overdue",
  in_review: "In Review",
};

export const changeStatusTone: Record<ChangeStatus, string> = {
  open: "bg-danger/10 text-danger border-danger/30",
  acknowledged: "bg-warning/15 text-[oklch(0.5_0.12_75)] border-warning/40",
  resolved: "bg-success/15 text-success border-success/30",
};

export const changeIcon: Record<ChangeType, ElementType> = {
  ownership: Users,
  directors: Users,
  address: MapPin,
  sanctions: ShieldAlert,
  litigation: Gavel,
  financials: TrendingUp,
  industry: Building2,
  media: Newspaper,
};

export const fmtMoney = (n: number) =>
  n >= 1e9
    ? `$${(n / 1e9).toFixed(1)}B`
    : n >= 1e6
      ? `$${(n / 1e6).toFixed(1)}M`
      : `$${n.toLocaleString()}`;

export function daysAgoLabel(iso: string): string {
  const then = new Date(iso + "T00:00:00Z").getTime();
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (Number.isNaN(days)) return iso;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function ErrorState({ onRetry, label }: { onRetry: () => void; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <AlertCircle className="h-5 w-5 text-danger" />
      <div className="text-sm text-muted-foreground">{label ?? "Couldn't load this data."}</div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function EmptyState({ icon: Icon, label }: { icon?: ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="h-6 w-6 opacity-40" />}
      {label}
    </div>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", riskTone[level])}>
      {level}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: KycStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", statusTone[status])}>
      {statusLabel[status]}
    </Badge>
  );
}

export function ChangeStatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", changeStatusTone[status])}>
      {status}
    </Badge>
  );
}

export function RiskMeter({ score, level }: { score: number; level: RiskLevel }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: riskVar[level] }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8">{score}</span>
    </div>
  );
}

export function AccountAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <div
      className={cn(
        "rounded-md grid place-items-center font-semibold text-primary-foreground shrink-0",
        size === "md" ? "w-11 h-11 text-sm" : "w-9 h-9 text-xs",
      )}
      style={{ background: "var(--gradient-primary)" }}
    >
      {initials}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  tint = "primary",
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  tint?: "primary" | "accent" | "danger" | "warning" | "info" | "success";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent",
    danger: "bg-danger/15 text-danger",
    warning: "bg-warning/20 text-[oklch(0.5_0.12_75)]",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-lg grid place-items-center shrink-0", tones[tint])}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-semibold tracking-tight leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}
