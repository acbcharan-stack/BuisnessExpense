import "server-only";

import ExcelJS from "exceljs";
import { RECORD_TYPE_LABELS } from "@/lib/types";
import { APP_NAME } from "@/lib/constants";
import type {
  BusinessRow,
  CategoryRow,
  ExpenseRow,
  ExpenseLineItemRow,
  ExpenseTaxRow,
  ProfileRow,
  VendorRow,
} from "@/lib/supabase/database.types";

export interface WorkbookInput {
  expenses: ExpenseRow[];
  lineItems: ExpenseLineItemRow[];
  taxes: ExpenseTaxRow[];
  vendors: Pick<VendorRow, "id" | "name" | "tax_id" | "tax_id_type" | "country">[];
  categories: Pick<CategoryRow, "id" | "name" | "zoho_account_name">[];
  businesses: Pick<BusinessRow, "id" | "name" | "gstin">[];
  profiles: Pick<ProfileRow, "id" | "full_name">[];
}

const money = "#,##0.00";
const dateFmt = "yyyy-mm-dd";

const asDate = (v: string | null): Date | null =>
  v ? new Date(`${v}T00:00:00`) : null;
const asDateTime = (v: string | null): Date | null => (v ? new Date(v) : null);

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
}

/** Builds an .xlsx workbook: Records + Line items + Taxes sheets. */
export async function buildRecordsWorkbook(
  input: WorkbookInput,
): Promise<ExcelJS.Buffer> {
  const vendorById = new Map(input.vendors.map((v) => [v.id, v]));
  const categoryById = new Map(input.categories.map((c) => [c.id, c]));
  const businessById = new Map(input.businesses.map((b) => [b.id, b]));
  const bizName = (id: string | null) =>
    id ? (businessById.get(id)?.name ?? "") : "";
  const nameById = new Map(
    input.profiles.map((p) => [p.id, p.full_name || "—"]),
  );
  const expenseById = new Map(input.expenses.map((e) => [e.id, e]));

  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();

  /* ---- Sheet 1: Records (one row per invoice / expense) ---------------- */
  const records = wb.addWorksheet("Records", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  records.columns = [
    { header: "Business", key: "business", width: 12 },
    { header: "Business GSTIN", key: "business_gstin", width: 18 },
    { header: "Record type", key: "record_type", width: 12 },
    { header: "Status", key: "status", width: 11 },
    { header: "Invoice number", key: "invoice_number", width: 18 },
    { header: "Invoice date", key: "invoice_date", width: 13, style: { numFmt: dateFmt } },
    { header: "Due date", key: "due_date", width: 13, style: { numFmt: dateFmt } },
    { header: "Vendor", key: "vendor", width: 26 },
    { header: "Vendor tax ID", key: "vendor_tax_id", width: 18 },
    { header: "Vendor tax ID type", key: "vendor_tax_id_type", width: 15 },
    { header: "Category", key: "category", width: 24 },
    { header: "Zoho account", key: "zoho_account", width: 22 },
    { header: "Expense type", key: "expense_type", width: 13 },
    { header: "Currency", key: "currency", width: 9 },
    { header: "Subtotal", key: "subtotal", width: 14, style: { numFmt: money } },
    { header: "Tax total", key: "tax_total", width: 14, style: { numFmt: money } },
    { header: "Total", key: "total", width: 14, style: { numFmt: money } },
    { header: "FX rate", key: "fx_rate", width: 10, style: { numFmt: "#,##0.000000" } },
    { header: "Amount (INR)", key: "amount_inr", width: 15, style: { numFmt: money } },
    { header: "Country", key: "country", width: 9 },
    { header: "Notes", key: "notes", width: 40 },
    { header: "Zoho reference", key: "zoho_reference", width: 16 },
    { header: "Confirmed by", key: "confirmed_by", width: 18 },
    { header: "Confirmed at", key: "confirmed_at", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Exported at", key: "exported_at", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Created at", key: "created_at", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Record ID", key: "id", width: 38 },
  ];

  for (const e of input.expenses) {
    const v = e.vendor_id ? vendorById.get(e.vendor_id) : undefined;
    const c = e.category_id ? categoryById.get(e.category_id) : undefined;
    records.addRow({
      business: bizName(e.business_id),
      business_gstin: e.business_id
        ? (businessById.get(e.business_id)?.gstin ?? "")
        : "",
      record_type: RECORD_TYPE_LABELS[e.record_type] ?? e.record_type,
      status: e.status,
      invoice_number: e.invoice_number ?? "",
      invoice_date: asDate(e.invoice_date),
      due_date: asDate(e.due_date),
      vendor: v?.name ?? "",
      vendor_tax_id: v?.tax_id ?? "",
      vendor_tax_id_type: v?.tax_id_type ?? "",
      category: c?.name ?? "",
      zoho_account: c?.zoho_account_name ?? "",
      expense_type: e.expense_type ?? "",
      currency: e.currency,
      subtotal: e.subtotal ?? null,
      tax_total: e.tax_total ?? null,
      total: e.total ?? null,
      fx_rate: e.fx_rate ?? null,
      amount_inr: e.amount_inr ?? null,
      country: e.country,
      notes: e.notes ?? "",
      zoho_reference: e.zoho_reference ?? "",
      confirmed_by: e.confirmed_by ? nameById.get(e.confirmed_by) ?? "" : "",
      confirmed_at: asDateTime(e.confirmed_at),
      exported_at: asDateTime(e.exported_at),
      created_at: asDateTime(e.created_at),
      id: e.id,
    });
  }
  styleHeader(records.getRow(1));

  /* ---- Sheet 2: Line items ------------------------------------------- */
  const lines = wb.addWorksheet("Line items", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  lines.columns = [
    { header: "Business", key: "business", width: 12 },
    { header: "Record type", key: "record_type", width: 12 },
    { header: "Invoice number", key: "invoice_number", width: 18 },
    { header: "Vendor", key: "vendor", width: 26 },
    { header: "Invoice date", key: "invoice_date", width: 13, style: { numFmt: dateFmt } },
    { header: "Line no", key: "line_no", width: 8 },
    { header: "Description", key: "description", width: 40 },
    { header: "HSN/SAC", key: "hsn_sac", width: 12 },
    { header: "Quantity", key: "quantity", width: 12, style: { numFmt: "#,##0.###" } },
    { header: "Unit price", key: "unit_price", width: 14, style: { numFmt: money } },
    { header: "Amount", key: "amount", width: 14, style: { numFmt: money } },
    { header: "Tax rate %", key: "tax_rate", width: 11, style: { numFmt: "0.00" } },
    { header: "Record ID", key: "expense_id", width: 38 },
  ];
  const sortedLines = [...input.lineItems].sort(
    (a, b) =>
      a.expense_id.localeCompare(b.expense_id) ||
      (a.line_no ?? 0) - (b.line_no ?? 0),
  );
  for (const li of sortedLines) {
    const e = expenseById.get(li.expense_id);
    const v = e?.vendor_id ? vendorById.get(e.vendor_id) : undefined;
    lines.addRow({
      business: bizName(e?.business_id ?? null),
      record_type: e ? (RECORD_TYPE_LABELS[e.record_type] ?? e.record_type) : "",
      invoice_number: e?.invoice_number ?? "",
      vendor: v?.name ?? "",
      invoice_date: asDate(e?.invoice_date ?? null),
      line_no: li.line_no ?? null,
      description: li.description ?? "",
      hsn_sac: li.hsn_sac ?? "",
      quantity: li.quantity ?? null,
      unit_price: li.unit_price ?? null,
      amount: li.amount ?? null,
      tax_rate: li.tax_rate ?? null,
      expense_id: li.expense_id,
    });
  }
  styleHeader(lines.getRow(1));

  /* ---- Sheet 3: Taxes ---------------------------------------------- */
  const tax = wb.addWorksheet("Taxes", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  tax.columns = [
    { header: "Business", key: "business", width: 12 },
    { header: "Record type", key: "record_type", width: 12 },
    { header: "Invoice number", key: "invoice_number", width: 18 },
    { header: "Vendor", key: "vendor", width: 26 },
    { header: "Invoice date", key: "invoice_date", width: 13, style: { numFmt: dateFmt } },
    { header: "Tax type", key: "tax_type", width: 12 },
    { header: "Rate %", key: "rate", width: 10, style: { numFmt: "0.00" } },
    { header: "Amount", key: "amount", width: 14, style: { numFmt: money } },
    { header: "Jurisdiction", key: "jurisdiction", width: 16 },
    { header: "Record ID", key: "expense_id", width: 38 },
  ];
  const sortedTaxes = [...input.taxes].sort((a, b) =>
    a.expense_id.localeCompare(b.expense_id),
  );
  for (const t of sortedTaxes) {
    const e = expenseById.get(t.expense_id);
    const v = e?.vendor_id ? vendorById.get(e.vendor_id) : undefined;
    tax.addRow({
      business: bizName(e?.business_id ?? null),
      record_type: e ? (RECORD_TYPE_LABELS[e.record_type] ?? e.record_type) : "",
      invoice_number: e?.invoice_number ?? "",
      vendor: v?.name ?? "",
      invoice_date: asDate(e?.invoice_date ?? null),
      tax_type: t.tax_type,
      rate: t.rate ?? null,
      amount: t.amount ?? null,
      jurisdiction: t.jurisdiction ?? "",
      expense_id: t.expense_id,
    });
  }
  styleHeader(tax.getRow(1));

  /* ---- Sheet 4: Additional fields --------------------------------- */
  const custom = wb.addWorksheet("Additional fields", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  custom.columns = [
    { header: "Business", key: "business", width: 12 },
    { header: "Record type", key: "record_type", width: 14 },
    { header: "Invoice number", key: "invoice_number", width: 18 },
    { header: "Vendor", key: "vendor", width: 26 },
    { header: "Invoice date", key: "invoice_date", width: 13, style: { numFmt: dateFmt } },
    { header: "Field", key: "label", width: 24 },
    { header: "Value", key: "value", width: 40 },
    { header: "Record ID", key: "expense_id", width: 38 },
  ];
  for (const e of input.expenses) {
    const v = e.vendor_id ? vendorById.get(e.vendor_id) : undefined;
    for (const f of e.custom_fields ?? []) {
      custom.addRow({
        business: bizName(e.business_id),
        record_type: RECORD_TYPE_LABELS[e.record_type] ?? e.record_type,
        invoice_number: e.invoice_number ?? "",
        vendor: v?.name ?? "",
        invoice_date: asDate(e.invoice_date),
        label: f.label,
        value: f.value,
        expense_id: e.id,
      });
    }
  }
  styleHeader(custom.getRow(1));

  return wb.xlsx.writeBuffer();
}
