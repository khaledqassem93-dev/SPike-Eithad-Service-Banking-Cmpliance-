import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Loader2, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/lib/kyc-ui";
import { mutateSaveClientSubmission } from "@/lib/api/kyc.functions";

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

function ClientPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitted, setSubmitted] = useState(false);

  const submitM = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => mutateSaveClientSubmission({ data }),
    onSuccess: () => {
      setSubmitted(true);
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

  return (
    <AppShell active="client" title="Client Updates" subtitle="Submit updated company data">
      <PageHeader
        title="Client Updates · تحديثات العملاء"
        description="Fill in your updated company details below. Our compliance team will review your submission."
      />

      <Card className="p-5 max-w-2xl">
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
          <form onSubmit={(e) => { e.preventDefault(); submitM.mutate(form); }} className="space-y-3">
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
                <select required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.profitStatus} onChange={(e) => setForm({ ...form, profitStatus: e.target.value as "profit" | "nonprofit" })}>
                  <option value="profit">Profit / ربحي</option>
                  <option value="nonprofit">Nonprofit / غير ربحي</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Tax Exemption <span className="text-muted-foreground font-normal">/ الإعفاء الضريبي</span><span className="text-danger ml-0.5">*</span></Label>
                <select required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.taxExemptionStatus} onChange={(e) => setForm({ ...form, taxExemptionStatus: e.target.value as "exempt" | "partial" | "none" })}>
                  <option value="">Select / اختر</option>
                  <option value="none">None / لا يوجد</option>
                  <option value="partial">Partial / جزئي</option>
                  <option value="exempt">Exempt / معفي</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 py-1">
              <input type="checkbox" id="isListed" checked={form.isListed} onChange={(e) => setForm({ ...form, isListed: e.target.checked })} className="w-4 h-4 accent-primary" />
              <Label htmlFor="isListed" className="text-xs font-medium cursor-pointer">Listed on stock exchange · مدرجة في البورصة</Label>
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
    </AppShell>
  );
}
