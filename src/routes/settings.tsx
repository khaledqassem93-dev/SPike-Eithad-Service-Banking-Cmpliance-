import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Save, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AppShell } from "@/components/app-shell";
import { ErrorState, PageHeader } from "@/lib/kyc-ui";
import {
  fetchSettings,
  mutateRescreenAll,
  mutateUpdateSettings,
} from "@/lib/api/kyc.functions";
import type { AppSettings } from "@/lib/kyc-types";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Bank al Etihad KYC" }] }),
  component: SettingsPage,
});

const INVALIDATE_ALL = [
  "settings",
  "stats",
  "accounts",
  "distribution",
  "insights",
  "alerts",
  "detections",
  "reviews",
  "reviewQueue",
  "liveFeed",
  "trend",
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>
        <div className="shrink-0 w-64">{children}</div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data, form]);

  function invalidateAll() {
    for (const k of INVALIDATE_ALL) qc.invalidateQueries({ queryKey: [k] });
  }

  const saveM = useMutation({
    mutationFn: (s: AppSettings) =>
      mutateUpdateSettings({ data: { ...s, aiApiKey: apiKey.trim() || undefined } }),
    onSuccess: (saved) => {
      setForm(saved);
      setApiKey("");
      qc.setQueryData(["settings"], saved);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyM = useMutation({
    mutationFn: async (s: AppSettings) => {
      await mutateUpdateSettings({ data: { ...s, aiApiKey: apiKey.trim() || undefined } });
      return mutateRescreenAll();
    },
    onSuccess: (res) => {
      setApiKey("");
      toast.success(`Re-screened ${res.count} accounts with the new policy`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = saveM.isPending || applyM.isPending;

  return (
    <AppShell active="settings" title="Settings" subtitle="Screening policy">
      <PageHeader
        title="Screening policy"
        description="These thresholds drive the live detection engine. Save to persist, or apply across the whole book."
      />

      {q.isError ? (
        <Card>
          <ErrorState onRetry={() => q.refetch()} label="Couldn't load settings." />
        </Card>
      ) : !form ? (
        <Card className="p-5 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1">
              <SlidersHorizontal className="w-4 h-4 text-accent" />
              Detection thresholds
            </div>

            <Row
              label="Name-match sensitivity"
              hint="Minimum similarity for a beneficial owner to match a watchlist entry. Lower = more matches."
            >
              <div className="flex items-center gap-3">
                <Slider
                  value={[Math.round(form.matchThreshold * 100)]}
                  min={50}
                  max={99}
                  step={1}
                  onValueChange={([v]) => setForm({ ...form, matchThreshold: v / 100 })}
                />
                <span className="text-sm font-semibold tabular-nums w-12 text-right">
                  {Math.round(form.matchThreshold * 100)}%
                </span>
              </div>
            </Row>

            <Row
              label="UBO disclosure threshold"
              hint="Ownership percentage that triggers a disclosure change."
            >
              <div className="flex items-center gap-3">
                <Slider
                  value={[form.ownershipThreshold]}
                  min={5}
                  max={75}
                  step={1}
                  onValueChange={([v]) => setForm({ ...form, ownershipThreshold: v })}
                />
                <span className="text-sm font-semibold tabular-nums w-12 text-right">
                  {form.ownershipThreshold}%
                </span>
              </div>
            </Row>

            <Row
              label="Review window"
              hint="Days before a KYC review is flagged 'due soon'."
            >
              <div className="flex items-center gap-3">
                <Slider
                  value={[form.dueSoonDays]}
                  min={7}
                  max={180}
                  step={1}
                  onValueChange={([v]) => setForm({ ...form, dueSoonDays: v })}
                />
                <span className="text-sm font-semibold tabular-nums w-16 text-right">
                  {form.dueSoonDays}d
                </span>
              </div>
            </Row>

            <Row
              label="Auto-flag critical accounts"
              hint="Surface critical-risk accounts in the triage queue automatically."
            >
              <div className="flex justify-end">
                <Switch
                  checked={form.autoEscalateCritical}
                  onCheckedChange={(v) => setForm({ ...form, autoEscalateCritical: v })}
                />
              </div>
            </Row>
          </Card>

          <Card className="p-5">
            <div className="text-sm font-semibold mb-1">Organisation</div>
            <Row label="Institution name" hint="Shown across the workspace.">
              <Input
                value={form.orgName}
                onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                className="h-9"
              />
            </Row>
            <Row label="Compliance officer" hint="Recorded as the actor on audit events.">
              <Input
                value={form.officerName}
                onChange={(e) => setForm({ ...form, officerName: e.target.value })}
                className="h-9"
              />
            </Row>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1">
              <Sparkles className="w-4 h-4 text-accent" />
              Cowork Compliance agent
            </div>
            <p className="text-xs text-muted-foreground">
              An AI advisor that recommends the actions required under Central Bank of Jordan
              AML/CFT instructions for each case. Paste your Anthropic (Claude) API key — it is
              stored server-side and used only to generate guidance; it is never sent to the browser.
            </p>
            <Row
              label="Anthropic API key"
              hint={
                form.aiConfigured
                  ? "A key is configured. Enter a new key to replace it."
                  : "Required to enable Cowork Compliance. Create one at console.anthropic.com."
              }
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={form.aiConfigured ? "•••••••••••• configured" : "sk-ant-..."}
                className="h-9"
              />
            </Row>
            <Row label="Model" hint="Claude model used for guidance (default: claude-opus-4-8).">
              <Input
                value={form.aiModel}
                onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                className="h-9"
              />
            </Row>
            <div className="pt-3 text-xs">
              {form.aiConfigured ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Configured &amp; active — open any account
                  to get CBJ guidance.
                </span>
              ) : (
                <span className="text-muted-foreground">Not configured — add a key and Save.</span>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => saveM.mutate(form)} disabled={busy}>
              {saveM.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              Save settings
            </Button>
            <Button
              variant="outline"
              onClick={() => applyM.mutate(form)}
              disabled={busy}
              style={{ borderColor: "var(--accent)" }}
            >
              {applyM.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              Save &amp; re-screen all accounts
            </Button>
            <span className="text-xs text-muted-foreground">
              Re-screening recomputes risk and KYC status for every account using these thresholds.
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}
