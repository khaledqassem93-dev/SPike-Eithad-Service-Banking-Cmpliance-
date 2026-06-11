export interface RegistrationFormData {
  legalEntityType: string;
  profitStatus: "profit" | "nonprofit";
  businessLine: string;
  legalNameAr: string;
  legalNameEn: string;
  declaredCapital: string;
  mainActivity: string;
  isListed: boolean;
  companyNationality: string;
  nationalId: string;
  registrationNumber: string;
  taxNumber: string;
  taxExemptionStatus: "exempt" | "partial" | "none";
  contactName: string;
  contactEmail: string;
}

export interface FieldMeta {
  fieldKey: keyof RegistrationFormData;
  labelEn: string;
  labelAr: string;
}

export const FIELD_META: FieldMeta[] = [
  { fieldKey: "legalEntityType",    labelEn: "Legal Entity Type",             labelAr: "نوع الكيان القانوني" },
  { fieldKey: "profitStatus",       labelEn: "Profit / Nonprofit",            labelAr: "ربحي / غير ربحي" },
  { fieldKey: "businessLine",       labelEn: "Business Line",                 labelAr: "خط العمل" },
  { fieldKey: "legalNameAr",        labelEn: "Company Legal Name (Arabic)",   labelAr: "الاسم القانوني (عربي)" },
  { fieldKey: "legalNameEn",        labelEn: "Company Legal Name (English)",  labelAr: "الاسم القانوني (إنجليزي)" },
  { fieldKey: "declaredCapital",    labelEn: "Declared Capital",              labelAr: "رأس المال المصرح به" },
  { fieldKey: "mainActivity",       labelEn: "Main Company Activity",         labelAr: "النشاط الرئيسي" },
  { fieldKey: "isListed",           labelEn: "Is Company Listed?",            labelAr: "مدرجة في البورصة؟" },
  { fieldKey: "companyNationality", labelEn: "Company Nationality",           labelAr: "جنسية الشركة" },
  { fieldKey: "nationalId",         labelEn: "National ID",                   labelAr: "الرقم الوطني" },
  { fieldKey: "registrationNumber", labelEn: "Registration Number",           labelAr: "رقم التسجيل" },
  { fieldKey: "taxNumber",          labelEn: "Tax Number",                    labelAr: "الرقم الضريبي" },
  { fieldKey: "taxExemptionStatus", labelEn: "Tax Exemption Status",          labelAr: "حالة الإعفاء الضريبي" },
];

/* ---------- QR extraction result ---------- */

export interface QrField {
  fieldKey: keyof RegistrationFormData;
  labelEn: string;
  labelAr: string;
  value: string;
  found: boolean;
}

export interface QrExtractedData {
  fields: QrField[];
  summary: string;
  rawQrData: string;
}

/* ---------- Batch directory scan ---------- */

export interface BatchScanRow {
  fileName: string;
  pageNumber: number;
  qrFound: boolean;
  qrText: string;
  extractedData: QrExtractedData | null;
  contactEmail: string;
  emailSent: boolean;
  emailPreview: string | null;
  status: "pending" | "no_qr" | "processed" | "notified" | "error";
  error?: string;
}

/* ---------- Submission (form vs QR) ---------- */

export interface SubmissionChange {
  fieldKey: string;
  labelEn: string;
  labelAr: string;
  qrValue: string;
  submittedValue: string;
}

export interface SubmissionResult {
  hasChanges: boolean;
  changes: SubmissionChange[];
  emailSent: boolean;
  emailPreview: string | null;
}
