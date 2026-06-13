import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Send,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/lib/kyc-ui";
import {
  fetchClientSubmissions,
  mutateSaveClientSubmission,
  mutateClientSubmissionStatus,
} from "@/lib/api/kyc.functions";

export const Route = createFileRoute("/client")({
  head: () => ({ meta: [{ title: "Client Updates — Bank al Etihad KYC" }] }),
  component: ClientPage,
});

const EMPTY_FORM = {
  legalEntityType: "",
  profitStatus: "profit" as const,
  businessLine: "",
  legalNameAr: "",
  legalNameEn: "",
  declaredCapital: "",
  mainActivity: "",
  isListed: false,
  companyNationality: "",
  nationalId: "",
  registrationNumber: "",
  taxNumber: "",
  taxExemptionStatus: "none" as const,
  contactName: "",
  contactEmail: "",
};

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

function SubmissionRow({ sub, onStatus }: {
  sub: ReturnType<typeof Object.assign> & { id: string; contactName: string; contactEmail: string; legalNameEn: string; registrationNumber: string; submittedAt: string; status: string };
  onStatus: (id: string, status: string) => void;
}) {
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {[
              ["Legal Name (EN)", sub.legalNameEn],
              ["Legal Name (AR) / الاسم العربي", sub.legalNameAr],
              ["Entity Type / نوع الكيان", sub.legalEntityType],
              ["Profit Status / ربحي", sub.profitStatus],
              ["Business Line / خط العمل", sub.businessLine],
              ["Main Activity / النشاط", sub.mainActivity],
              ["Declared Capital / رأس المال", sub.declaredCapital],
              ["Nationality / الجنسية", sub.companyNationality],
              ["National ID / الرقم الوطني", sub.nationalId],
              ["Registration No.", sub.registrationNumber],
              ["Tax Number / الضريبي", sub.taxNumber],
              ["Tax Exemption / الإعفاء", sub.taxExemptionStatus],
              ["Listed / مدرجة", sub.isListed ? "Yes / نعم" : "No / لا"],
              ["Contact / المسؤول", sub.contactName],
              ["Email / البريد", sub.contactEmail],
            ].map(([label, value]) => (
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

function ClientPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitted, setSubmitted] = useState(false);

  const subsQ = useQuery({
    queryKey: ["clientSubmissions"],
    queryFn: () => fetchClientSubmissions(),
  });

  const submitM = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => mutateSaveClientSubmission({ data }),
    onSuccess: () => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["clientSubmissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  function field(key: keyof typeof EMPTY_FORM, labelEn: string, labelAr: string, opts?: { dir?: string; type?: string }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs font-medium">
          {labelEn} <span className="text-muted-foreground font-normal">/ {labelAr}</span>
          <span className="text-danger ml-0.5">*</span>
        </Label>
        <Input
          required
          value={String(form[key])}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="h-9 text-sm"
          dir={opts?.dir}
          type={opts?.type}
        />
      </div>
    );
  }

  const pending = subsQ.data?.filter((s) => s.status === "pending").length ?? 0;

  return (
    <AppShell active="client" title="Client Updates" subtitle="Company data submissions">
      <PageHeader
        title="Client Updates · تحديثات العملاء"
        description="Clients submit updated company details here. Bank staff review and approve below."
      />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* ── Client submission form ── */}
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-4">
            <UserCheck className="w-4 h-4 text-accent" />
            Update Your Company Data · تحديث بيانات شركتك
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-success" />
              <p className="font-semibold text-lg">Submitted successfully · تم الإرسال بنجاح</p>
              <p className="text-sm text-muted-foreground">
                Our compliance team will review your update shortly.
                <br />
                سيقوم فريق الامتثال لدينا بمراجعة تحديثك قريباً.
              </p>
              <Button variant="outline" className="mt-2" onClick={() => { setForm({ ...EMPTY_FORM }); setSubmitted(false); }}>
                Submit another · إرسال آخر
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); submitM.mutate(form); }}
              className="space-y-3"
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {field("legalNameEn", "Company Legal Name (English)", "الاسم القانوني بالإنجليزية")}
                {field("legalNameAr", "Company Legal Name (Arabic)", "الاسم القانوني بالعربية", { dir: "rtl" })}
                {field("legalEntityType", "Legal Entity Type", "نوع الكيان القانوني")}
                {field("businessLine", "Business Line", "خط العمل")}
                {field("mainActivity", "Main Activity", "النشاط الرئيسي")}
                {field("declaredCapital", "Declared Capital", "رأس المال المصرح به")}
                {field("companyNationality", "Company Nationality", "جنسية الشركة")}
                {field("nationalId", "National ID", "الرقم الوطني")}
                {field("registrationNumber", "Registration Number", "رقم التسجيل")}
                {field("taxNumber", "Tax Number", "الرقم الضريبي")}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Profit Status <span className="text-muted-foreground font-normal">/ الوضع الربحي</span><span className="text-danger ml-0.5">*</span></Label>
                  <select
                    required
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.profitStatus}
                    onChange={(e) => setForm({ ...form, profitStatus: e.target.value as "profit" | "nonprofit" })}
                  >
                    <option value="profit">Profit / ربحي</option>
                    <option value="nonprofit">Nonprofit / غير ربحي</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Tax Exemption <span className="text-muted-foreground font-normal">/ الإعفاء الضريبي</span><span className="text-danger ml-0.5">*</span></Label>
                  <select
                    required
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.taxExemptionStatus}
                    onChange={(e) => setForm({ ...form, taxExemptionStatus: e.target.value as "exempt" | "partial" | "none" })}
                  >
                    <option value="">Select / اختر</option>
                    <option value="none">None / لا يوجد</option>
                    <option value="partial">Partial / جزئي</option>
                    <option value="exempt">Exempt / معفي</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="isListed"
                  checked={form.isListed}
                  onChange={(e) => setForm({ ...form, isListed: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <Label htmlFor="isListed" className="text-xs font-medium cursor-pointer">
                  Listed on stock exchange · مدرجة في البورصة
                </Label>
              </div>

              <div className="border-t border-border pt-3 grid sm:grid-cols-2 gap-3">
                {field("contactName", "Contact Name", "اسم المسؤول")}
                {field("contactEmail", "Contact Email", "البريد الإلكتروني", { type: "email" })}
              </div>

              <Button type="submit" className="w-full mt-1" disabled={submitM.isPending}>
                {submitM.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
                  : <><Send className="w-4 h-4 mr-2" />Submit Update · إرسال التحديث</>}
              </Button>
            </form>
          )}
        </Card>

        {/* ── Bank staff: submissions list ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Received Submissions · الطلبات الواردة
              {pending > 0 && (
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning font-semibold">
                  {pending} pending
                </span>
              )}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["clientSubmissions"] })}>
              Refresh
            </Button>
          </div>

          {subsQ.isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading submissions…</div>
          ) : !subsQ.data?.length ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No client submissions yet. They will appear here once clients fill in the form.
            </Card>
          ) : (
            <div className="space-y-2">
              {subsQ.data.map((sub) => (
                <SubmissionRow
                  key={sub.id}
                  sub={sub as any}
                  onStatus={(id, status) => statusM.mutate({ id, status })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
