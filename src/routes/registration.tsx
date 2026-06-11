import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Loader2,
  Mail,
  QrCode,
  RotateCcw,
  Send,
  Upload,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  mutateExtractQrData,
  mutateSubmitRegistration,
  mutateScanDirectory,
  mutateProcessBatch,
} from "@/lib/api/kyc.functions";
import type {
  QrExtractedData,
  QrField,
  RegistrationFormData,
  SubmissionResult,
} from "@/lib/registration-types";

export const Route = createFileRoute("/registration")({
  head: () => ({ meta: [{ title: "Company Registration — Bank al Etihad KYC" }] }),
  component: RegistrationPage,
});

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

type Step = "scan" | "results" | "form";
type ScanMode = "camera" | "file" | "directory";

const ENTITY_TYPES = [
  "LLC", "JSC", "Partnership", "Sole Proprietorship",
  "Branch", "Representative Office", "Other",
];
const NATIONALITIES = [
  "Jordanian", "Saudi", "Emirati", "Kuwaiti",
  "Bahraini", "Qatari", "Omani", "Egyptian", "Other",
];

const EMPTY_FORM: RegistrationFormData = {
  legalEntityType: "", profitStatus: "profit", businessLine: "",
  legalNameAr: "", legalNameEn: "", declaredCapital: "",
  mainActivity: "", isListed: false, companyNationality: "",
  nationalId: "", registrationNumber: "", taxNumber: "",
  taxExemptionStatus: "none", contactName: "", contactEmail: "",
};

/* ------------------------------------------------------------------ */
/*  Step 1 — QR Scanner                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Directory batch scan panel                                          */
/* ------------------------------------------------------------------ */

function DirectoryScanPanel() {
  const [dirPath, setDirPath] = useState("C:\\certificates");
  const [scanItems, setScanItems] = useState<import("@/lib/registration-types").BatchScanRow[] | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const scanMut = useMutation({
    mutationFn: (path: string) => mutateScanDirectory({ data: { dirPath: path } }),
  });

  const processMut = useMutation({
    mutationFn: (vars: { items: Parameters<typeof mutateProcessBatch>[0]["data"]["items"]; contactEmails: Record<string, string> }) =>
      mutateProcessBatch({ data: vars }),
    onSuccess: (rows) => setScanItems(rows),
  });

  function rowKey(fileName: string, page: number) {
    return `${fileName}::${page}`;
  }

  function handleScan() {
    scanMut.mutate(dirPath, {
      onSuccess: (items) => {
        // Pre-build empty email map
        const emailMap: Record<string, string> = {};
        items.forEach((it) => {
          if (it.qrFound) emailMap[rowKey(it.fileName, it.pageNumber)] = "";
        });
        setEmails(emailMap);
        setScanItems(null);
      },
    });
  }

  function handleProcess() {
    if (!scanMut.data) return;
    processMut.mutate({ items: scanMut.data, contactEmails: emails });
  }

  const scannedItems = scanMut.data ?? [];
  const withQr = scannedItems.filter((i) => i.qrFound);
  const emailsFilled = Object.values(emails).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Path input */}
      <div className="space-y-2">
        <Label className="text-sm">
          Directory path on this server · مسار المجلد على الخادم
        </Label>
        <div className="flex gap-2">
          <Input
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            placeholder="C:\certificates  or  /home/user/certificates"
            className="font-mono text-sm flex-1"
          />
          <Button
            onClick={handleScan}
            disabled={!dirPath.trim() || scanMut.isPending}
            className="shrink-0"
          >
            {scanMut.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Scanning…</>
            ) : (
              <><FolderOpen className="w-4 h-4 mr-2" />Scan PDFs</>
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The server will scan all PDF files in this directory and extract QR codes from every page. ·
          سيقوم الخادم بمسح جميع ملفات PDF في هذا المجلد واستخراج رموز QR من كل صفحة.
        </p>
      </div>

      {scanMut.isError && (
        <div className="flex items-start gap-2 text-danger text-sm p-3 rounded-lg bg-danger/10 border border-danger/20">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {(scanMut.error as Error).message}
        </div>
      )}

      {/* Scan results table */}
      {scannedItems.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="text-sm font-semibold">
              {scannedItems.length} PDF{scannedItems.length > 1 ? "s" : ""} found ·{" "}
              {withQr.length} with QR code
            </div>
            {withQr.length > 0 && !processMut.data && (
              <Button
                size="sm"
                onClick={handleProcess}
                disabled={processMut.isPending || emailsFilled === 0}
              >
                {processMut.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Processing…</>
                ) : (
                  <><Send className="w-3.5 h-3.5 mr-1.5" />Run AI & Notify All ({emailsFilled})</>
                )}
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/10">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">File · الملف</th>
                  <th className="text-left font-medium px-4 py-2.5 w-24">QR</th>
                  <th className="text-left font-medium px-4 py-2.5">
                    Contact Email · بريد التواصل
                  </th>
                  <th className="text-center font-medium px-4 py-2.5 w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {scannedItems.map((item) => {
                  const key = rowKey(item.fileName, item.pageNumber);
                  const result = processMut.data?.find(
                    (r) => r.fileName === item.fileName && r.pageNumber === item.pageNumber,
                  );
                  const isExpanded = expandedRow === key;

                  return (
                    <>
                      <tr
                        key={key}
                        className={cn(
                          "border-t border-border",
                          item.qrFound && "cursor-pointer hover:bg-muted/20",
                        )}
                        onClick={() => item.qrFound && setExpandedRow(isExpanded ? null : key)}
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium truncate max-w-[220px]">{item.fileName}</div>
                          {item.pageNumber > 0 && (
                            <div className="text-[11px] text-muted-foreground">Page {item.pageNumber}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.qrFound ? (
                            <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />Found
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <XCircle className="w-3.5 h-3.5 opacity-40" />None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {item.qrFound ? (
                            <Input
                              type="email"
                              size={1}
                              value={emails[key] ?? ""}
                              onChange={(e) =>
                                setEmails((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder="client@company.com"
                              className="h-7 text-xs w-52"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result ? (
                            result.emailSent ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                                <Mail className="w-3 h-3" />Sent
                              </span>
                            ) : result.status === "processed" ? (
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                Processed
                              </span>
                            ) : result.status === "error" ? (
                              <span className="text-xs text-danger bg-danger/10 px-2 py-0.5 rounded-full">
                                Error
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                                <Mail className="w-3 h-3" />Queued
                              </span>
                            )
                          ) : item.error ? (
                            <span className="text-xs text-danger bg-danger/10 px-2 py-0.5 rounded-full">Error</span>
                          ) : item.qrFound ? (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Ready</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded: show extracted fields */}
                      {isExpanded && result?.extractedData && (
                        <tr key={`${key}-expanded`} className="border-t border-border bg-muted/5">
                          <td colSpan={4} className="px-5 py-4">
                            <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                              Extracted fields from QR · الحقول المستخرجة
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {result.extractedData.fields
                                .filter((f) => f.found)
                                .map((f) => (
                                  <div key={f.fieldKey} className="rounded-md bg-background border border-border px-3 py-2">
                                    <div className="text-[10px] text-muted-foreground">{f.labelEn}</div>
                                    <div className="text-sm font-medium truncate">{f.value}</div>
                                  </div>
                                ))}
                            </div>
                            {result.emailPreview && (
                              <details className="mt-3">
                                <summary className="text-xs text-primary cursor-pointer flex items-center gap-1">
                                  <Mail className="w-3.5 h-3.5" />
                                  {result.emailSent ? "Email sent — view preview" : "Email preview"}
                                </summary>
                                <div
                                  className="mt-2 rounded-lg border border-border overflow-hidden text-xs"
                                  dangerouslySetInnerHTML={{ __html: result.emailPreview }}
                                />
                              </details>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {withQr.length > 0 && !processMut.data && emailsFilled === 0 && (
            <div className="px-5 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
              Enter a contact email for each company to enable AI extraction and notification.
              · أدخل بريد التواصل لكل شركة لتفعيل الاستخراج والإشعار.
            </div>
          )}
        </Card>
      )}

      {scannedItems.length === 0 && scanMut.isSuccess && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No PDF files found in that directory. · لم يتم العثور على ملفات PDF في هذا المجلد.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — QR Scanner (manual: upload / camera; or batch: directory) */
/* ------------------------------------------------------------------ */

function QrScannerStep({
  onScanned,
  loading,
}: {
  onScanned: (text: string) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<ScanMode>("file");
  const [scannerReady, setScannerReady] = useState(false);
  const [scannedText, setScannedText] = useState("");
  const [decodeError, setDecodeError] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qrDivId = "qr-reader-camera";

  useEffect(() => { setScannerReady(true); }, []);

  // Camera mode — start/stop html5-qrcode scanner
  useEffect(() => {
    if (!scannerReady || mode !== "camera") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inst: any = null;
    import("html5-qrcode").then(({ Html5QrcodeScanner }) => {
      inst = new Html5QrcodeScanner(
        qrDivId,
        { fps: 10, qrbox: { width: 260, height: 260 }, rememberLastUsedCamera: false },
        false,
      );
      inst.render(
        (text: string) => { setScannedText(text); setDecodeError(""); },
        () => { /* per-frame decode errors — normal, ignore */ },
      );
      scannerRef.current = inst;
    });
    return () => { inst?.clear().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scannerReady]);

  async function handleFile(file: File) {
    setDecodeError("");
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader: any = new Html5Qrcode("__qr_file_worker__");
      const result: string = await reader.scanFile(file, true);
      setScannedText(result);
      reader.clear?.();
    } catch {
      setDecodeError("Could not read a QR code from this image. Try a clearer photo or use camera mode.");
    } finally {
      setScanning(false);
    }
  }

  const canVerify = scannedText.trim().length > 5;

  const MODES: Array<{ key: ScanMode; icon: React.ReactNode; labelEn: string; labelAr: string }> = [
    { key: "file",      icon: <Upload className="w-4 h-4" />,     labelEn: "Upload Image", labelAr: "رفع صورة" },
    { key: "camera",    icon: <Camera className="w-4 h-4" />,     labelEn: "Camera",       labelAr: "كاميرا" },
    { key: "directory", icon: <FolderOpen className="w-4 h-4" />, labelEn: "Directory Scan (Batch)", labelAr: "مسح مجلد (دُفعة)" },
  ];

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <QrCode className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-base">
          Scan Registration Certificate QR
          <span className="text-muted-foreground font-arabic text-sm mr-2">
            — مسح رمز QR لشهادة التسجيل
          </span>
        </h2>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
              mode === m.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {m.icon}
            {m.labelEn}
            <span className={cn("text-[10px] font-arabic", mode === m.key ? "opacity-75" : "opacity-50")}>
              · {m.labelAr}
            </span>
          </button>
        ))}
      </div>

      {/* Directory batch mode */}
      {mode === "directory" && <DirectoryScanPanel />}

      {/* Manual modes (upload / camera) */}
      {mode !== "directory" && (
        <>
          <p className="text-sm text-muted-foreground -mt-2">
            Scan the QR code from the official registration certificate (Companies Control Department).
            The AI will extract and verify the official data.
            <br />
            <span className="font-arabic text-xs">
              امسح رمز QR من الشهادة الرسمية. سيستخرج الذكاء الاصطناعي البيانات ويتحقق منها.
            </span>
          </p>

          {/* Hidden element required by html5-qrcode for file scanning */}
          <div id="__qr_file_worker__" className="hidden" />

          {/* File upload zone */}
          {mode === "file" && (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
                scannedText
                  ? "border-success/50 bg-success/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/20",
              )}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              {scanning ? (
                <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-3" />
              ) : scannedText ? (
                <CheckCircle2 className="w-10 h-10 mx-auto text-success mb-3" />
              ) : (
                <QrCode className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              )}
              <p className="text-sm text-muted-foreground">
                {scanning ? "Decoding QR…" : scannedText ? "QR decoded — click to replace" : "Click or drag an image of the QR code here"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-arabic">
                {scannedText ? "تم فك رمز QR — انقر للاستبدال" : "انقر أو اسحب صورة رمز QR هنا"}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Camera live scanner */}
          {mode === "camera" && (
            <div>
              <div id={qrDivId} className="rounded-xl overflow-hidden border border-border" />
              {scannedText && (
                <div className="mt-3 flex items-center gap-2 text-success text-sm p-3 rounded-lg bg-success/10 border border-success/20">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  QR scanned successfully · تم المسح بنجاح
                </div>
              )}
            </div>
          )}

          {decodeError && (
            <div className="flex items-center gap-2 text-danger text-sm p-3 rounded-lg bg-danger/10 border border-danger/20">
              <XCircle className="w-4 h-4 shrink-0" />
              {decodeError}
            </div>
          )}

          {/* Scanned text + manual fallback */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                QR data (editable) · بيانات رمز QR (قابلة للتعديل)
              </Label>
              {canVerify && <span className="text-[11px] text-success">Ready · جاهز</span>}
            </div>
            <textarea
              value={scannedText}
              onChange={(e) => setScannedText(e.target.value)}
              rows={4}
              placeholder={`Paste QR data manually, e.g.:\n{"registrationNumber":"12345","legalNameEn":"Al Noor Trading LLC","legalNameAr":"شركة النور للتجارة","nationalId":"1-234-567890","declaredCapital":"500000","taxNumber":"987654321"}`}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button
            onClick={() => onScanned(scannedText)}
            disabled={!canVerify || loading}
            className="w-full h-11 text-base"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Extracting data…</>
            ) : (
              <>
                Extract & Verify with AI
                <span className="mr-2 ml-1 opacity-75 text-sm">· استخراج والتحقق بالذكاء الاصطناعي</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Verification Results (what the QR contained)             */
/* ------------------------------------------------------------------ */

function VerificationResultsStep({
  qrData,
  onProceed,
  onBack,
}: {
  qrData: QrExtractedData;
  onProceed: () => void;
  onBack: () => void;
}) {
  const foundCount = qrData.fields.filter((f) => f.found).length;
  const totalCount = qrData.fields.length;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card className={cn(
        "p-5 border flex items-start gap-4",
        foundCount === totalCount ? "bg-success/8 border-success/25" : "bg-primary/5 border-primary/20",
      )}>
        <CheckCircle2 className="w-7 h-7 text-success shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">
            {foundCount} of {totalCount} fields extracted from QR certificate
            <span className="text-muted-foreground font-arabic font-normal text-sm mr-2">
              · تم استخراج {foundCount} من {totalCount} حقلاً
            </span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">{qrData.summary}</div>
        </div>
      </Card>

      {/* Field-by-field table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
          <span className="text-sm font-semibold">
            Extracted Fields · الحقول المستخرجة
          </span>
          <span className="text-xs text-muted-foreground">{foundCount} found · {totalCount - foundCount} not found</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/10">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Field · الحقل</th>
                <th className="text-left font-medium px-4 py-2.5">Official Value · القيمة الرسمية</th>
                <th className="text-center font-medium px-4 py-2.5 w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {qrData.fields.map((f: QrField) => (
                <tr key={f.fieldKey} className="border-t border-border">
                  <td className="px-5 py-3">
                    <div className="font-medium text-sm">{f.labelEn}</div>
                    <div className="text-[11px] text-muted-foreground font-arabic">{f.labelAr}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {f.found
                      ? <span className="font-medium">{f.value}</span>
                      : <span className="text-muted-foreground italic text-xs">Not in certificate · غير موجود في الشهادة</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    {f.found ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Found
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        <XCircle className="w-3 h-3 opacity-50" />
                        Missing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          ← Back to QR scan · العودة لمسح QR
        </button>
        <Button onClick={onProceed} className="px-8">
          <ClipboardList className="w-4 h-4 mr-2" />
          Proceed to Registration Form
          <span className="mr-2 ml-1 opacity-75 text-sm">· انتقل للنموذج</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Registration Form (pre-filled from QR)                   */
/* ------------------------------------------------------------------ */

function FormField({
  labelEn,
  labelAr,
  fromQr,
  required,
  children,
}: {
  labelEn: string;
  labelAr: string;
  fromQr?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-sm">
          {labelEn}
          {required && <span className="text-danger ml-0.5">*</span>}
          <span className="text-muted-foreground text-[11px] mr-1.5 font-arabic"> — {labelAr}</span>
        </Label>
        {fromQr && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
            From QR · من QR
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  highlight,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  highlight?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring",
        highlight ? "border-primary/40 bg-primary/5" : "border-input",
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function RegistrationFormStep({
  initialForm,
  qrData,
  onSubmit,
  onBack,
  submitting,
  submitResult,
}: {
  initialForm: RegistrationFormData;
  qrData: QrExtractedData;
  onSubmit: (form: RegistrationFormData) => void;
  onBack: () => void;
  submitting: boolean;
  submitResult: SubmissionResult | null;
}) {
  const [form, setForm] = useState<RegistrationFormData>(initialForm);
  const [formError, setFormError] = useState("");
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Track which fields came from QR
  const qrFieldMap = new Map(qrData.fields.filter((f) => f.found).map((f) => [f.fieldKey, f.value]));

  function set<K extends keyof RegistrationFormData>(key: K, value: RegistrationFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.legalNameEn.trim() || !form.contactEmail.trim() || !form.contactName.trim()) {
      setFormError("Please fill all required fields. · يرجى ملء جميع الحقول المطلوبة.");
      return;
    }
    setFormError("");
    onSubmit(form);
  }

  // If we already have a result, show the confirmation panel
  if (submitResult) {
    return (
      <div className="space-y-5">
        {/* Result banner */}
        <Card className={cn(
          "p-5 flex items-start gap-4 border",
          submitResult.hasChanges
            ? "bg-warning/8 border-warning/25"
            : "bg-success/8 border-success/25",
        )}>
          {submitResult.hasChanges
            ? <AlertTriangle className="w-7 h-7 text-warning shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-7 h-7 text-success shrink-0 mt-0.5" />
          }
          <div>
            <div className="font-semibold text-base">
              {submitResult.hasChanges
                ? `${submitResult.changes.length} field${submitResult.changes.length > 1 ? "s" : ""} differ from official QR data`
                : "Registration submitted — all fields match official QR data"}
            </div>
            <div className="text-sm text-muted-foreground font-arabic mt-1">
              {submitResult.hasChanges
                ? `تم اكتشاف ${submitResult.changes.length} تناقض مع البيانات الرسمية`
                : "تم تقديم التسجيل — جميع الحقول تطابق بيانات QR الرسمية"}
            </div>
            {submitResult.hasChanges && (
              <div className={cn(
                "mt-2 text-sm flex items-center gap-1.5",
                submitResult.emailSent ? "text-success" : "text-muted-foreground",
              )}>
                <Mail className="w-3.5 h-3.5" />
                {submitResult.emailSent
                  ? `Notification sent to ${form.contactEmail}`
                  : "Email preview ready below — SMTP not configured"}
              </div>
            )}
          </div>
        </Card>

        {/* Changed fields */}
        {submitResult.hasChanges && (
          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <span className="text-sm font-semibold">Fields Changed from Official Data · الحقول المغيّرة</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/10">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Field · الحقل</th>
                  <th className="text-left font-medium px-4 py-2.5 text-success">Official (QR) · الرسمي</th>
                  <th className="text-left font-medium px-4 py-2.5 text-danger">Submitted · المقدم</th>
                </tr>
              </thead>
              <tbody>
                {submitResult.changes.map((c) => (
                  <tr key={c.fieldKey} className="border-t border-border">
                    <td className="px-5 py-3">
                      <div className="font-medium">{c.labelEn}</div>
                      <div className="text-[11px] text-muted-foreground font-arabic">{c.labelAr}</div>
                    </td>
                    <td className="px-4 py-3 text-success font-medium">{c.qrValue || "—"}</td>
                    <td className="px-4 py-3 text-danger">{c.submittedValue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Email preview */}
        {submitResult.emailPreview && (
          <div>
            <button
              onClick={() => setShowEmailPreview((v) => !v)}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Mail className="w-4 h-4" />
              {showEmailPreview ? "Hide" : "Show"} notification email
              <span className="text-muted-foreground text-xs">
                · {submitResult.emailSent ? "تم الإرسال" : "معاينة"}
              </span>
            </button>
            {showEmailPreview && (
              <div
                className="mt-3 rounded-xl border border-border overflow-hidden"
                dangerouslySetInnerHTML={{ __html: submitResult.emailPreview }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-base">
          Registration Form
          <span className="text-muted-foreground font-arabic text-sm mr-2"> — نموذج التسجيل</span>
        </h2>
        {qrFieldMap.size > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {qrFieldMap.size} fields pre-filled from QR · حقول مملوءة من QR
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Legal */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b border-border">
            Legal Information · المعلومات القانونية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField labelEn="Legal Entity Type" labelAr="نوع الكيان القانوني" fromQr={qrFieldMap.has("legalEntityType")} required>
              <SelectField
                value={form.legalEntityType}
                onChange={(v) => set("legalEntityType", v)}
                highlight={qrFieldMap.has("legalEntityType")}
                options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
                placeholder="Select type…"
              />
            </FormField>

            <FormField labelEn="Profit or Nonprofit" labelAr="ربحي أو غير ربحي" fromQr={qrFieldMap.has("profitStatus")} required>
              <div className="flex gap-4 pt-1">
                {(["profit", "nonprofit"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="profitStatus"
                      value={v}
                      checked={form.profitStatus === v}
                      onChange={() => set("profitStatus", v)}
                      className="accent-primary"
                    />
                    {v === "profit" ? "Profit · ربحي" : "Nonprofit · غير ربحي"}
                  </label>
                ))}
              </div>
            </FormField>

            <FormField labelEn="Business Line" labelAr="خط العمل" fromQr={qrFieldMap.has("businessLine")} required>
              <Input
                value={form.businessLine}
                onChange={(e) => set("businessLine", e.target.value)}
                className={cn(qrFieldMap.has("businessLine") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. Financial Services"
              />
            </FormField>

            <FormField labelEn="Main Company Activity" labelAr="النشاط الرئيسي" fromQr={qrFieldMap.has("mainActivity")} required>
              <Input
                value={form.mainActivity}
                onChange={(e) => set("mainActivity", e.target.value)}
                className={cn(qrFieldMap.has("mainActivity") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. Import and export of goods"
              />
            </FormField>

            <FormField labelEn="Company Legal Name (Arabic)" labelAr="الاسم القانوني (عربي)" fromQr={qrFieldMap.has("legalNameAr")} required>
              <Input
                dir="rtl"
                lang="ar"
                value={form.legalNameAr}
                onChange={(e) => set("legalNameAr", e.target.value)}
                className={cn("font-arabic text-right", qrFieldMap.has("legalNameAr") && "border-primary/40 bg-primary/5")}
                placeholder="الاسم القانوني للشركة"
              />
            </FormField>

            <FormField labelEn="Company Legal Name (English)" labelAr="الاسم القانوني (إنجليزي)" fromQr={qrFieldMap.has("legalNameEn")} required>
              <Input
                value={form.legalNameEn}
                onChange={(e) => set("legalNameEn", e.target.value)}
                className={cn(qrFieldMap.has("legalNameEn") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. Al Noor Trading LLC"
              />
            </FormField>

            <FormField labelEn="Declared Capital (JOD)" labelAr="رأس المال (دينار أردني)" fromQr={qrFieldMap.has("declaredCapital")} required>
              <Input
                value={form.declaredCapital}
                onChange={(e) => set("declaredCapital", e.target.value)}
                className={cn(qrFieldMap.has("declaredCapital") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. 500000"
              />
            </FormField>

            <FormField labelEn="Company Nationality" labelAr="جنسية الشركة" fromQr={qrFieldMap.has("companyNationality")} required>
              <SelectField
                value={form.companyNationality}
                onChange={(v) => set("companyNationality", v)}
                highlight={qrFieldMap.has("companyNationality")}
                options={NATIONALITIES.map((n) => ({ value: n, label: n }))}
                placeholder="Select nationality…"
              />
            </FormField>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <input
              type="checkbox"
              id="isListed"
              checked={form.isListed}
              onChange={(e) => set("isListed", e.target.checked)}
              className="w-4 h-4 accent-primary rounded"
            />
            <label htmlFor="isListed" className="text-sm cursor-pointer flex items-center gap-2">
              Company is publicly listed
              <span className="text-muted-foreground font-arabic text-[11px]">· مدرجة في البورصة</span>
              {qrFieldMap.has("isListed") && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  From QR
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Registration & Tax */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b border-border">
            Registration & Tax · التسجيل والضرائب
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField labelEn="National ID" labelAr="الرقم الوطني" fromQr={qrFieldMap.has("nationalId")} required>
              <Input
                value={form.nationalId}
                onChange={(e) => set("nationalId", e.target.value)}
                className={cn(qrFieldMap.has("nationalId") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. 1-234-567890"
              />
            </FormField>

            <FormField labelEn="Registration Number" labelAr="رقم التسجيل" fromQr={qrFieldMap.has("registrationNumber")} required>
              <Input
                value={form.registrationNumber}
                onChange={(e) => set("registrationNumber", e.target.value)}
                className={cn(qrFieldMap.has("registrationNumber") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. 12345"
              />
            </FormField>

            <FormField labelEn="Tax Number" labelAr="الرقم الضريبي" fromQr={qrFieldMap.has("taxNumber")}>
              <Input
                value={form.taxNumber}
                onChange={(e) => set("taxNumber", e.target.value)}
                className={cn(qrFieldMap.has("taxNumber") && "border-primary/40 bg-primary/5")}
                placeholder="e.g. 123456789"
              />
            </FormField>

            <FormField labelEn="Tax Exemption Status" labelAr="حالة الإعفاء الضريبي" fromQr={qrFieldMap.has("taxExemptionStatus")} required>
              <SelectField
                value={form.taxExemptionStatus}
                onChange={(v) => set("taxExemptionStatus", v as RegistrationFormData["taxExemptionStatus"])}
                highlight={qrFieldMap.has("taxExemptionStatus")}
                options={[
                  { value: "none", label: "Not Exempt · غير معفى" },
                  { value: "partial", label: "Partial Exemption · إعفاء جزئي" },
                  { value: "exempt", label: "Fully Exempt · معفى بالكامل" },
                ]}
              />
            </FormField>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b border-border">
            Contact Person · الشخص المخوّل بالتواصل
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField labelEn="Contact Person Name" labelAr="اسم الشخص المخوّل" required>
              <Input
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Full name · الاسم الكامل"
              />
            </FormField>

            <FormField labelEn="Contact Email" labelAr="البريد الإلكتروني للتواصل" required>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="contact@company.com"
              />
            </FormField>
          </div>
        </div>

        {formError && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back to results · العودة للنتائج
          </button>

          <Button type="submit" disabled={submitting} className="px-8 h-11">
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting…</>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Registration
                <span className="mr-2 ml-1 opacity-75 text-sm">· تقديم التسجيل</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page — orchestrates the three steps                           */
/* ------------------------------------------------------------------ */

function RegistrationPage() {
  const [step, setStep] = useState<Step>("scan");
  const [qrData, setQrData] = useState<QrExtractedData | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmissionResult | null>(null);

  // Build a pre-filled form from extracted QR fields
  function buildInitialForm(fields: QrField[]): RegistrationFormData {
    const form = { ...EMPTY_FORM };
    for (const f of fields) {
      if (!f.found) continue;
      if (f.fieldKey === "isListed") {
        (form as Record<string, unknown>)[f.fieldKey] = f.value === "true";
      } else {
        (form as Record<string, unknown>)[f.fieldKey] = f.value;
      }
    }
    return form;
  }

  const extractMutation = useMutation({
    mutationFn: (qrText: string) => mutateExtractQrData({ data: { qrText } }),
    onSuccess: (data) => {
      setQrData(data);
      setStep("results");
    },
  });

  const submitMutation = useMutation({
    mutationFn: (vars: { form: RegistrationFormData; qrFields: QrField[] }) =>
      mutateSubmitRegistration({ data: vars }),
    onSuccess: (data) => {
      setSubmitResult(data);
    },
  });

  function handleReset() {
    setStep("scan");
    setQrData(null);
    setSubmitResult(null);
    extractMutation.reset();
    submitMutation.reset();
  }

  const STEPS: Array<{ key: Step; labelEn: string; labelAr: string }> = [
    { key: "scan",    labelEn: "Scan QR",              labelAr: "مسح رمز QR" },
    { key: "results", labelEn: "Verification Results", labelAr: "نتائج التحقق" },
    { key: "form",    labelEn: "Registration Form",    labelAr: "نموذج التسجيل" },
  ];

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <AppShell active="registration" title="Company Registration" subtitle="KYC onboarding">
      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div key={s.key} className="flex items-center gap-1">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                active  ? "bg-primary text-primary-foreground shadow-sm" :
                done    ? "bg-success/15 text-success" :
                          "bg-muted text-muted-foreground",
              )}>
                <span className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  active ? "bg-white/20" : "",
                )}>
                  {done ? "✓" : i + 1}
                </span>
                {s.labelEn}
                <span className={cn("opacity-60 font-arabic", active ? "" : "")}>{s.labelAr}</span>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}

        {/* Reset button — shown after first step */}
        {step !== "scan" && (
          <button
            onClick={handleReset}
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start over · ابدأ من جديد
          </button>
        )}
      </div>

      {/* Step 1: Scan */}
      {step === "scan" && (
        <QrScannerStep
          onScanned={(text) => extractMutation.mutate(text)}
          loading={extractMutation.isPending}
        />
      )}

      {/* Step 1 error */}
      {extractMutation.isError && step === "scan" && (
        <Card className="p-5 flex items-center gap-3 border-danger/30 bg-danger/5">
          <XCircle className="w-5 h-5 text-danger shrink-0" />
          <div className="text-sm text-danger">{(extractMutation.error as Error).message}</div>
        </Card>
      )}

      {/* Step 2: Verification Results */}
      {step === "results" && qrData && (
        <VerificationResultsStep
          qrData={qrData}
          onProceed={() => setStep("form")}
          onBack={() => setStep("scan")}
        />
      )}

      {/* Step 3: Registration Form */}
      {step === "form" && qrData && (
        <RegistrationFormStep
          initialForm={buildInitialForm(qrData.fields)}
          qrData={qrData}
          onSubmit={(form) => submitMutation.mutate({ form, qrFields: qrData.fields })}
          onBack={() => { setSubmitResult(null); submitMutation.reset(); }}
          submitting={submitMutation.isPending}
          submitResult={submitResult}
        />
      )}

      {/* Step 3 error */}
      {submitMutation.isError && (
        <Card className="p-5 flex items-center gap-3 border-danger/30 bg-danger/5">
          <XCircle className="w-5 h-5 text-danger shrink-0" />
          <div className="text-sm text-danger">{(submitMutation.error as Error).message}</div>
        </Card>
      )}
    </AppShell>
  );
}
