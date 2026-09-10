import "server-only";

import { RECORD_TYPE_LABELS } from "@/lib/types";
import type {
  BusinessRow,
  CategoryRow,
  ExpenseRow,
  ProfileRow,
  VendorRow,
} from "@/lib/supabase/database.types";

/**
 * Flat one-row-per-record CSV. Same columns as the "Records" sheet of the
 * Excel export (`lib/export/records-workbook.ts`) — keep the two in sync.
 */
export interface RecordsCsvInput {
  expenses: ExpenseRow[];
  vendors: Pick<
    VendorRow,
    "id" | "name" | "tax_id" | "tax_id_type" | "country"
  >[];
  categories: Pick<CategoryRow, "id" | "name" | "zoho_account_name">[];
  businesses: Pick<BusinessRow, "id" | "name" | "gstin">[];
  profiles: Pick<ProfileRow, "id" | "full_name">[];
}

/** UTF-8 byte-order mark. Written first so Excel opens the file as UTF-8. */
const BOM = "﻿";

/**
 * Render one CSV cell. Two defences against a hostile value (vendor names,
 * notes and invoice numbers all originate from scanned documents):
 *
 *  - **Formula injection.** A spreadsheet treats a cell starting with `=`, `+`,
 *    `-`, `@` (or a tab / carriage return) as a live formula, which can be used
 *    to read other cells or call out to a URL. We put a single quote in front
 *    so it is shown as plain text instead.
 *  - **Column break-out.** A value containing a quote, comma or newline is
 *    wrapped in double quotes with any internal quotes doubled, so it can't
 *    push later fields into the wrong columns.
 *
 * Metaphor: before pasting each scrap of paper into the ledger we check it for
 * scissors and glue — anything that could rearrange the page gets sealed in a
 * clear sleeve first.
 */
function cell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/["\n\r,]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const num = (v: number | string | null | undefined): string =>
  v == null ? "" : String(v);

const HEADERS = [
  "Business",
  "Business GSTIN",
  "Record type",
  "Status",
  "Invoice number",
  "Invoice date",
  "Due date",
  "Vendor",
  "Vendor tax ID",
  "Vendor tax ID type",
  "Category",
  "Zoho account",
  "Expense type",
  "Currency",
  "Subtotal",
  "Tax total",
  "Total",
  "FX rate",
  "Amount (INR)",
  "Country",
  "Notes",
  "Zoho reference",
  "Confirmed by",
  "Confirmed at",
  "Exported at",
  "Created at",
  "Record ID",
] as const;

export function buildRecordsCsv(input: RecordsCsvInput): string {
  const vendorById = new Map(input.vendors.map((v) => [v.id, v]));
  const categoryById = new Map(input.categories.map((c) => [c.id, c]));
  const businessById = new Map(input.businesses.map((b) => [b.id, b]));
  const nameById = new Map(
    input.profiles.map((p) => [p.id, p.full_name || ""]),
  );

  const lines = [HEADERS.map(cell).join(",")];

  for (const e of input.expenses) {
    const v = e.vendor_id ? vendorById.get(e.vendor_id) : undefined;
    const c = e.category_id ? categoryById.get(e.category_id) : undefined;
    const b = e.business_id ? businessById.get(e.business_id) : undefined;

    const row = [
      b?.name ?? "",
      b?.gstin ?? "",
      RECORD_TYPE_LABELS[e.record_type] ?? e.record_type,
      e.status,
      e.invoice_number ?? "",
      e.invoice_date ?? "",
      e.due_date ?? "",
      v?.name ?? "",
      v?.tax_id ?? "",
      v?.tax_id_type ?? "",
      c?.name ?? "",
      c?.zoho_account_name ?? "",
      e.expense_type ?? "",
      e.currency,
      num(e.subtotal),
      num(e.tax_total),
      num(e.total),
      num(e.fx_rate),
      num(e.amount_inr),
      e.country,
      e.notes ?? "",
      e.zoho_reference ?? "",
      e.confirmed_by ? (nameById.get(e.confirmed_by) ?? "") : "",
      e.confirmed_at ?? "",
      e.exported_at ?? "",
      e.created_at ?? "",
      e.id,
    ];
    lines.push(row.map(cell).join(","));
  }

  // CRLF line endings per RFC 4180; trailing newline.
  return BOM + lines.join("\r\n") + "\r\n";
}
