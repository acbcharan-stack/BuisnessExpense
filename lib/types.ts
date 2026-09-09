/** Shared domain enums & types. Keep in sync with supabase/migrations. */

export const USER_ROLES = ["owner", "accountant", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Top-level split that drives the two tabs in the UI. */
export const RECORD_TYPES = ["invoice", "expense"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Finer classification, suggested by the extractor, editable by users. */
export const EXPENSE_TYPES = [
  "invoice",
  "bill",
  "receipt",
  "utility",
  "payroll",
] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const DOCUMENT_SOURCES = ["camera", "upload", "email"] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

export const DOCUMENT_STATUSES = [
  "uploaded",
  "processing",
  "extracted",
  "failed",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const JOB_STATUSES = ["queued", "running", "done", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EXPENSE_STATUSES = [
  "review",
  "confirmed",
  "exported",
  "archived",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const TAX_ID_TYPES = ["GSTIN", "VAT", "EIN", "OTHER"] as const;
export type TaxIdType = (typeof TAX_ID_TYPES)[number];

export const TAX_TYPES = [
  "CGST",
  "SGST",
  "IGST",
  "CESS",
  "VAT",
  "GST",
  "SALES_TAX",
  "OTHER",
] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export function canConfirmAndExport(role: UserRole): boolean {
  return role === "owner" || role === "accountant";
}

export function canDelete(role: UserRole): boolean {
  return role === "owner" || role === "accountant";
}
