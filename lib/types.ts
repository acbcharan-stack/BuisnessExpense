/** Shared domain enums & types. Keep in sync with supabase/migrations. */

/**
 * Access level, 1-4. Every signed-in user has full access; the number is an
 * organisational label only (migration 0004 flattened the old
 * owner/accountant/staff roles). Kept as a range so it can regain meaning later
 * without another type migration.
 */
export const ROLE_LEVELS = [1, 2, 3, 4] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

/** Top-level split that drives the two tabs in the UI. */
export const RECORD_TYPES = ["invoice", "expense"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/**
 * User-facing labels. The `invoice` record type is shown as "Purchase Order"
 * across the UI and exports; the stored enum value stays `invoice`.
 */
export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  invoice: "Purchase Order",
  expense: "Expense",
};
export const RECORD_TYPE_LABELS_SHORT: Record<RecordType, string> = {
  invoice: "PO",
  expense: "Expense",
};

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

/**
 * A Purchase Order record (the supplier's document) is converted into OUR
 * invoice agreeing to the supplier's price: our letterhead, logo, signature
 * and bank details, with the supplier shown as the vendor. The UI only ever
 * creates "purchase"; "sale" stays in the DB check constraint (migration
 * 0005) so no schema change is needed.
 */
export const INVOICE_DIRECTIONS = ["purchase", "sale"] as const;
export type InvoiceDirection = (typeof INVOICE_DIRECTIONS)[number];
export const INVOICE_DIRECTION_LABELS: Record<InvoiceDirection, string> = {
  purchase: "Purchase Invoice",
  sale: "Sale Invoice",
};

export const GENERATED_INVOICE_STATUSES = ["draft", "confirmed", "void"] as const;
export type GeneratedInvoiceStatus = (typeof GENERATED_INVOICE_STATUSES)[number];
