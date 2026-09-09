/**
 * Hand-authored to match supabase/migrations/0001_init.sql.
 *
 * NOTE: these are written as `type` aliases (not `interface`) on purpose —
 * Supabase's typed query builder requires each row to satisfy
 * `Record<string, unknown>`, which only object *type aliases* get an implicit
 * index signature for.
 *
 * Regenerate from the live project once it exists:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > lib/supabase/database.types.ts
 */

export type UserRoleDb = "owner" | "accountant" | "staff";
export type RecordTypeDb = "invoice" | "expense";
export type ExpenseTypeDb =
  | "invoice"
  | "bill"
  | "receipt"
  | "utility"
  | "payroll";
export type DocumentSourceDb = "camera" | "upload" | "email";
export type DocumentStatusDb =
  | "uploaded"
  | "processing"
  | "extracted"
  | "failed";
export type JobStatusDb = "queued" | "running" | "done" | "error";
export type ExpenseStatusDb = "review" | "confirmed" | "exported" | "archived";
export type TaxIdTypeDb = "GSTIN" | "VAT" | "EIN" | "OTHER";
export type TaxTypeDb =
  | "CGST"
  | "SGST"
  | "IGST"
  | "CESS"
  | "VAT"
  | "GST"
  | "SALES_TAX"
  | "OTHER";

export type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRoleDb;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  zoho_account_name: string | null;
  default_record_type: RecordTypeDb;
  parent_id: string | null;
  is_archived: boolean;
  created_at: string;
};

export type VendorRow = {
  id: string;
  name: string;
  normalized_name: string;
  tax_id: string | null;
  tax_id_type: TaxIdTypeDb | null;
  country: string;
  default_category_id: string | null;
  zoho_vendor_name: string | null;
  created_by: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  sha256: string | null;
  source: DocumentSourceDb;
  sender_email: string | null;
  uploaded_by: string | null;
  status: DocumentStatusDb;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtractionJobRow = {
  id: string;
  document_id: string;
  status: JobStatusDb;
  attempts: number;
  last_error: string | null;
  gemini_model: string | null;
  raw_response: unknown | null;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type ExpenseRow = {
  id: string;
  document_id: string;
  vendor_id: string | null;
  category_id: string | null;
  record_type: RecordTypeDb;
  expense_type: ExpenseTypeDb | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  country: string;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  fx_rate: number;
  amount_inr: number | null;
  notes: string | null;
  category_set_by: string | null;
  status: ExpenseStatusDb;
  confirmed_by: string | null;
  confirmed_at: string | null;
  exported_at: string | null;
  zoho_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseLineItemRow = {
  id: string;
  expense_id: string;
  line_no: number | null;
  description: string | null;
  hsn_sac: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  tax_rate: number | null;
};

export type ExpenseTaxRow = {
  id: string;
  expense_id: string;
  tax_type: TaxTypeDb;
  rate: number | null;
  amount: number;
  jurisdiction: string | null;
};

export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  entity: string;
  entity_id: string;
  action: string;
  diff: unknown | null;
  created_at: string;
};

type TableShape<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow>;
      categories: TableShape<CategoryRow>;
      vendors: TableShape<VendorRow>;
      documents: TableShape<DocumentRow>;
      extraction_jobs: TableShape<ExtractionJobRow>;
      expenses: TableShape<ExpenseRow>;
      expense_line_items: TableShape<ExpenseLineItemRow>;
      expense_taxes: TableShape<ExpenseTaxRow>;
      audit_log: TableShape<AuditLogRow>;
    };
    Views: Record<string, never>;
    Functions: {
      current_role_name: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      can_write: { Args: Record<PropertyKey, never>; Returns: boolean };
      can_manage: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRoleDb;
      record_type: RecordTypeDb;
      expense_type: ExpenseTypeDb;
      document_source: DocumentSourceDb;
      document_status: DocumentStatusDb;
      job_status: JobStatusDb;
      expense_status: ExpenseStatusDb;
      tax_id_type: TaxIdTypeDb;
      tax_type: TaxTypeDb;
    };
    CompositeTypes: Record<string, never>;
  };
};
