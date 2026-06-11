import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";

import type {
  BatchScanRow,
  QrExtractedData,
  QrField,
  RegistrationFormData,
  SubmissionChange,
  SubmissionResult,
} from "../registration-types";
import { FIELD_META } from "../registration-types";
import type { PdfScanItem } from "./pdf-scanner.server";

/* ------------------------------------------------------------------ */
/*  Step 1 — extract structured fields from raw QR text                */
/* ------------------------------------------------------------------ */

const EXTRACT_SYSTEM = `You are a company registration data extractor for a bank in Jordan.

Your input is the raw content of a QR code from a Jordanian company registration certificate
issued by the Companies Control Department (دائرة مراقبة الشركات).

The QR data may be JSON, XML, plain text, a URL with embedded params, or a mixed format.

Extract the following fields from the QR data. For each field return the value exactly as found in the data.
If a field is not present or cannot be inferred, mark it as not found.

Fields to extract:
- legalEntityType: type of legal entity (LLC / JSC / Partnership / etc.)
- profitStatus: "profit" or "nonprofit"
- businessLine: the business sector or line
- legalNameAr: company legal name in Arabic
- legalNameEn: company legal name in English
- declaredCapital: capital amount (numeric string, no currency symbols)
- mainActivity: the company's primary business activity
- isListed: "true" or "false" — whether the company is listed on a stock exchange
- companyNationality: nationality / country of incorporation
- nationalId: the national identification number
- registrationNumber: company registration number
- taxNumber: tax identification number
- taxExemptionStatus: one of "exempt", "partial", or "none"

Return ONLY valid JSON, no markdown, no commentary:
{
  "fields": [
    { "fieldKey": string, "value": string, "found": boolean }
  ],
  "summary": string
}`;

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI did not return valid JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

export async function extractQrData(
  qrText: string,
  apiKey: string,
  model: string,
): Promise<QrExtractedData> {
  if (!apiKey) {
    // No key: return all fields as not-found with a clear message
    const fields: QrField[] = FIELD_META.filter((m) => m.fieldKey !== "contactName" && m.fieldKey !== "contactEmail").map(
      (m) => ({ fieldKey: m.fieldKey, labelEn: m.labelEn, labelAr: m.labelAr, value: "", found: false }),
    );
    return {
      fields,
      summary: "No AI API key configured. Add one in Settings → Cowork Compliance agent, then try again.",
      rawQrData: qrText,
    };
  }

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const message = await client.messages.create({
    model: model || "claude-sonnet-4-6",
    max_tokens: 2048,
    system: EXTRACT_SYSTEM,
    messages: [{ role: "user", content: `Raw QR data:\n${qrText}` }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const raw = extractJson(text);
  const rawFields = Array.isArray(raw.fields) ? raw.fields : [];

  // Build the full fields array, merging AI output with our known metadata
  const fields: QrField[] = FIELD_META.filter(
    (m) => m.fieldKey !== "contactName" && m.fieldKey !== "contactEmail",
  ).map((m) => {
    const match = rawFields.find((f) => (f as Record<string, unknown>).fieldKey === m.fieldKey) as
      | Record<string, unknown>
      | undefined;
    const found = Boolean(match?.found);
    const value = found ? String(match?.value ?? "") : "";
    return { fieldKey: m.fieldKey, labelEn: m.labelEn, labelAr: m.labelAr, value, found };
  });

  return { fields, summary: String(raw.summary ?? ""), rawQrData: qrText };
}

/* ------------------------------------------------------------------ */
/*  Step 3 — compare submitted form with QR data, notify if changed    */
/* ------------------------------------------------------------------ */

function normalise(v: string) {
  return v.trim().toLowerCase().replace(/[\s,.-]+/g, "");
}

function valuesMatch(a: string, b: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // Numeric comparison for capital fields
  const numA = parseFloat(a.replace(/[^0-9.]/g, ""));
  const numB = parseFloat(b.replace(/[^0-9.]/g, ""));
  if (!isNaN(numA) && !isNaN(numB)) return numA === numB;
  return normalise(a) === normalise(b);
}

export async function checkAndNotifyChanges(
  form: RegistrationFormData,
  qrFields: QrField[],
): Promise<SubmissionResult> {
  const changes: SubmissionChange[] = [];

  for (const qf of qrFields) {
    if (!qf.found) continue;
    const formValue = String(form[qf.fieldKey] ?? "");
    if (!valuesMatch(formValue, qf.value)) {
      changes.push({
        fieldKey: qf.fieldKey,
        labelEn: qf.labelEn,
        labelAr: qf.labelAr,
        qrValue: qf.value,
        submittedValue: formValue,
      });
    }
  }

  const hasChanges = changes.length > 0;
  let emailSent = false;
  let emailPreview: string | null = null;

  if (hasChanges && form.contactEmail) {
    const result = await sendChangeNotification(form.contactEmail, form.contactName, changes);
    emailSent = result.sent;
    emailPreview = result.preview;
  }

  return { hasChanges, changes, emailSent, emailPreview };
}

/* ------------------------------------------------------------------ */
/*  Email                                                               */
/* ------------------------------------------------------------------ */

function buildChangeEmailHtml(contactName: string, changes: SubmissionChange[]): string {
  const rows = changes
    .map(
      (c) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <strong>${c.labelEn}</strong><br/>
        <span style="color:#6b7280;font-size:12px;">${c.labelAr}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;font-weight:600;">
        ${c.qrValue || "(empty)"}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#dc2626;">
        ${c.submittedValue || "(empty)"}
      </td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>تحديث بيانات التسجيل</title></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:660px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0f2d4a;padding:20px 24px;">
      <div style="color:#f97316;font-weight:700;font-size:13px;letter-spacing:.5px;text-transform:uppercase;">Bank al Etihad · KYC</div>
      <h1 style="color:#fff;margin:6px 0 0;font-size:20px;">Registration Data Changes Detected</h1>
      <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">تم اكتشاف تغييرات في بيانات التسجيل</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="color:#111827;font-size:15px;">Dear ${contactName},</p>
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        We have detected differences between your submitted registration form and the official data
        from the <strong>Companies Control Department QR certificate</strong>.
        Please review the changes below and contact your relationship manager if any data is incorrect.
      </p>
      <p style="color:#374151;font-size:13px;font-family:Arial,sans-serif;direction:rtl;text-align:right;margin-top:8px;">
        عزيزي ${contactName}، تم اكتشاف تناقضات بين النموذج المقدم والبيانات الرسمية من شهادة رمز QR
        الصادرة عن دائرة مراقبة الشركات. يرجى مراجعة الفروقات أدناه.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:20px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Field / الحقل</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#16a34a;font-weight:600;text-transform:uppercase;">Official (QR) / الرسمي</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#dc2626;font-weight:600;text-transform:uppercase;">Your Submission / المقدم</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top:24px;padding:16px 20px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;">
        <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">Action Required — إجراء مطلوب</p>
        <p style="margin:6px 0 0;color:#92400e;font-size:13px;line-height:1.6;">
          Please log into the bank portal and update your registration data within
          <strong>7 business days</strong> to match the official records,
          or contact your relationship manager for assistance.
          <br/>
          يرجى تسجيل الدخول وتحديث البيانات خلال <strong>7 أيام عمل</strong>.
        </p>
      </div>

      <p style="color:#9ca3af;font-size:11px;margin-top:28px;border-top:1px solid #f3f4f6;padding-top:16px;">
        This is an automated message from Bank al Etihad Corporate KYC Watch. Do not reply.<br/>
        رسالة آلية من نظام مراقبة KYC للشركات — بنك الاتحاد. لا ترد على هذه الرسالة.
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendChangeNotification(
  to: string,
  contactName: string,
  changes: SubmissionChange[],
): Promise<{ sent: boolean; preview: string }> {
  const html = buildChangeEmailHtml(contactName, changes);

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? "noreply@etihad-kyc.bank";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { sent: false, preview: html };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"Bank al Etihad KYC" <${smtpFrom}>`,
      to,
      subject: "Registration Data Changes | تغييرات في بيانات التسجيل",
      html,
    });
    return { sent: true, preview: html };
  } catch {
    return { sent: false, preview: html };
  }
}

/* ------------------------------------------------------------------ */
/*  Batch: process a directory of PDF QR codes                         */
/* ------------------------------------------------------------------ */

function buildBatchNotificationHtml(companyName: string, fields: QrField[]): string {
  const rows = fields
    .filter((f) => f.found)
    .map(
      (f) => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;">
        <strong>${f.labelEn}</strong>
        <span style="display:block;color:#9ca3af;font-size:11px;">${f.labelAr}</span>
      </td>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;color:#1e3a5f;">${f.value}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>تحديث بيانات التسجيل</title></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0f2d4a;padding:20px 24px;">
      <div style="color:#f97316;font-weight:700;font-size:12px;letter-spacing:.5px;text-transform:uppercase;">Bank al Etihad · KYC</div>
      <h1 style="color:#fff;margin:6px 0 0;font-size:18px;">Action Required: Update Your Registration</h1>
      <p style="color:#93c5fd;margin:4px 0 0;font-size:12px;">مطلوب إجراء: تحديث بيانات التسجيل</p>
    </div>
    <div style="padding:24px;">
      <p style="color:#111827;font-size:14px;">Dear ${companyName},</p>
      <p style="color:#374151;font-size:13px;line-height:1.7;">
        We have reviewed your company registration certificate. Our system has verified the following
        official data from the <strong>Companies Control Department</strong>.
        Please log into the bank portal to complete or update your registration form so it matches
        the official records below.
      </p>
      <p style="color:#374151;font-size:12px;direction:rtl;text-align:right;margin-top:6px;">
        لقد راجعنا شهادة تسجيل شركتك. يرجى تسجيل الدخول إلى بوابة البنك لإكمال أو تحديث
        نموذج التسجيل ليتطابق مع السجلات الرسمية الواردة أدناه.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f0f7ff;">
            <th style="padding:9px 12px;text-align:left;font-size:12px;color:#374151;font-weight:600;">Field · الحقل</th>
            <th style="padding:9px 12px;text-align:left;font-size:12px;color:#374151;font-weight:600;">Official Value · القيمة الرسمية</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top:20px;padding:14px 18px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
        <p style="margin:0;color:#1e40af;font-size:13px;font-weight:600;">
          Please update your registration within 7 business days.
        </p>
        <p style="margin:5px 0 0;color:#1e40af;font-size:12px;">
          يرجى تحديث تسجيلك خلال 7 أيام عمل.
        </p>
      </div>

      <p style="color:#9ca3af;font-size:11px;margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;">
        Automated message — Bank al Etihad Corporate KYC Watch. Do not reply.<br/>
        رسالة آلية — نظام مراقبة KYC للشركات في بنك الاتحاد.
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendBatchNotification(
  to: string,
  companyName: string,
  fields: QrField[],
): Promise<{ sent: boolean; preview: string }> {
  const html = buildBatchNotificationHtml(companyName, fields);
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? "noreply@etihad-kyc.bank";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { sent: false, preview: html };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"Bank al Etihad KYC" <${smtpFrom}>`,
      to,
      subject: `Action Required: Update Your Registration | ${companyName}`,
      html,
    });
    return { sent: true, preview: html };
  } catch {
    return { sent: false, preview: html };
  }
}

// Step 1: Scan a directory and extract QR data from all PDFs (no AI yet — fast)
export async function scanDirectoryQr(dirPath: string): Promise<PdfScanItem[]> {
  const { scanDirectoryForQr } = await import("./pdf-scanner.server");
  return scanDirectoryForQr(dirPath);
}

// Step 2: Run AI extraction on each scanned item, then notify via email
export async function processBatchItems(
  items: PdfScanItem[],
  contactEmails: Record<string, string>, // key = `${fileName}::${pageNumber}`
  apiKey: string,
  model: string,
): Promise<BatchScanRow[]> {
  const rows: BatchScanRow[] = [];

  for (const item of items) {
    if (!item.qrFound) {
      rows.push({
        fileName: item.fileName,
        pageNumber: item.pageNumber,
        qrFound: false,
        qrText: "",
        extractedData: null,
        contactEmail: "",
        emailSent: false,
        emailPreview: null,
        status: item.error ? "error" : "no_qr",
        error: item.error,
      });
      continue;
    }

    const key = `${item.fileName}::${item.pageNumber}`;
    const contactEmail = contactEmails[key] ?? "";

    let extractedData: QrExtractedData;
    try {
      extractedData = await extractQrData(item.qrText, apiKey, model);
    } catch (err) {
      rows.push({
        fileName: item.fileName,
        pageNumber: item.pageNumber,
        qrFound: true,
        qrText: item.qrText,
        extractedData: null,
        contactEmail,
        emailSent: false,
        emailPreview: null,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    let emailSent = false;
    let emailPreview: string | null = null;
    let status: BatchScanRow["status"] = "processed";

    if (contactEmail) {
      const companyName =
        extractedData.fields.find((f) => f.fieldKey === "legalNameEn" && f.found)?.value ||
        extractedData.fields.find((f) => f.fieldKey === "legalNameAr" && f.found)?.value ||
        item.fileName.replace(".pdf", "");

      const result = await sendBatchNotification(contactEmail, companyName, extractedData.fields);
      emailSent = result.sent;
      emailPreview = result.preview;
      status = "notified";
    }

    rows.push({
      fileName: item.fileName,
      pageNumber: item.pageNumber,
      qrFound: true,
      qrText: item.qrText,
      extractedData,
      contactEmail,
      emailSent,
      emailPreview,
      status,
    });
  }

  return rows;
}
