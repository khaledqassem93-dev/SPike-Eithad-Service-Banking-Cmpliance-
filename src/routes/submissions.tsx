import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/lib/kyc-ui";
import {
  fetchClientSubmissions,
  mutateClientSubmissionStatus,
} from "@/lib/api/kyc.functions";

export const Route = createFileRoute("/submissions")({
  head: () => ({ meta: [{ title: "Received Submissions — Bank al Etihad KYC" }] }),
  component: SubmissionsPage,
});

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="text-warning border-warning/40 bg-warning/10"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "reviewed":
      return <Badge variant="outline" className="text-blue-500 border-blue-400/40 bg-blue-500/10">Reviewed</Badge>;
    case "approved":
      return <Badge variant="outline" className="text-success border-success/40 bg-success/10"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge variant="outline" className="text-danger border-danger/40 bg-danger/10"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

type Submission = {
  id: string; contactName: string; contactEmail: string;
  legalNameEn: string; legalNameAr: string; legalEntityType: string;
  profitStatus: string; businessLine: string; mainActivity: string;
  declaredCapital: string; companyNationality: string; nationalId: string;
  registrationNumber: string; taxNumber: string; taxExemptionStatus: string;
  isListed: boolean; submittedAt: string; status: string;
};

function SubmissionRow({ sub, onStatus }: { sub: Submission; onStatus: (id: string, status: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{sub.legalNameEn || sub.contactName}</div>
          <div className="text-xs text-muted-foreground truncate">{sub.contactEmail} · {sub.registrationNumber}</div>
        </div>
        <div className="shrink-0">{statusBadge(sub.status)}</div>
        <div className="text-xs text-muted-foreground shrink-0 hidden md:block">
          {new Date(sub.submittedAt).toLocaleDateString()}
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 bg-muted/20 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {([
              ["Legal Name (EN)", sub.legalNameEn],
              ["Legal Name (AR) / الاسم العربي", sub.legalNameAr],
              ["Entity Type / نوع الكيان", sub.legalEntityType],
              ["Profit Status / ربحي", sub.profitStatus],
              ["Business Line / خط العمل", sub.businessLine],
              ["Main Activity / النشاط", sub.mainActivity],
              ["Declared Capital / رأس المال", sub.declaredCapital],
              ["Nationality / الجنسية", sub.companyNationality],
              ["National ID / الرقم الوطني", sub.nationalId],
              ["Registration No. / رقم التسجيل", sub.registrationNumber],
              ["Tax Number / الضريبي", sub.taxNumber],
              ["Tax Exemption / الإعفاء", sub.taxExemptionStatus],
              ["Listed / مدرجة", sub.isListed ? "Yes / نعم" : "No / لا"],
              ["Contact / المسؤول", sub.contactName],
              ["Email / البريد", sub.contactEmail],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="font-medium truncate">{value || "—"}</div>
              </div>
            ))}
          </div>

          {sub.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="bg-success/90 hover:bg-success text-white" onClick={() => onStatus(sub.id, "approved")}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onStatus(sub.id, "reviewed")}>
                Mark Reviewed
              </Button>
              <Button size="sm" variant="outline" className="text-danger border-danger/40 hover:bg-danger/10" onClick={() => onStatus(sub.id, "rejected")}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionsPage() {
  const qc = useQueryClient();

  const subsQ = useQuery({
    queryKey: ["clientSubmissions"],
    queryFn: () => fetchClientSubmissions(),
  });

  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      mutateClientSubmissionStatus({ data: { id, status: status as "pending" | "reviewed" | "approved" | "rejected" } }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["clientSubmissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = subsQ.data?.filter((s) => s.status === "pending").length ?? 0;

  return (
    <AppShell active="submissions" title="Received Submissions" subtitle="Client update requests">
      <PageHeader
        title="Received Submissions · الطلبات الواردة"
        description="Review and action client-submitted company data updates."
      />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Inbox className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {subsQ.data?.length ?? 0} total
          </span>
          {pending > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/20 text-warning font-semibold">
              {pending} pending
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["clientSubmissions"] })}>
          Refresh
        </Button>
      </div>

      {subsQ.isLoading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading submissions…</div>
      ) : !subsQ.data?.length ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No client submissions yet. They will appear here once clients fill in the update form.
        </Card>
      ) : (
        <div className="space-y-2">
          {subsQ.data.map((sub) => (
            <SubmissionRow
              key={sub.id}
              sub={sub as Submission}
              onStatus={(id, status) => statusM.mutate({ id, status })}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
