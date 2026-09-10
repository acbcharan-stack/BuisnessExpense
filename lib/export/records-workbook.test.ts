import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildRecordsWorkbook } from "./records-workbook";
import type { ExpenseRow } from "@/lib/supabase/database.types";

const expense: ExpenseRow = {
  id: "11111111-1111-1111-1111-111111111111",
  document_id: "d1",
  business_id: "b1",
  vendor_id: "v1",
  category_id: "c1",
  record_type: "invoice",
  expense_type: "bill",
  invoice_number: "INV-9",
  invoice_date: "2026-08-01",
  due_date: null,
  currency: "INR",
  country: "IN",
  subtotal: 100,
  tax_total: 18,
  total: 118,
  fx_rate: 1,
  amount_inr: 118,
  notes: "handwritten total",
  custom_fields: [
    { label: "PO number", value: "PO-4521" },
    { label: "Project", value: "Spindle rebuild" },
  ],
  category_set_by: "p1",
  status: "confirmed",
  confirmed_by: "p1",
  confirmed_at: "2026-08-02T10:00:00Z",
  exported_at: null,
  zoho_reference: null,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
};

const input = {
  expenses: [expense],
  lineItems: [
    {
      id: "l1",
      expense_id: expense.id,
      line_no: 1,
      description: "Carbide insert",
      hsn_sac: "8209",
      quantity: 2,
      unit_price: 50,
      amount: 100,
      tax_rate: 18,
    },
  ],
  taxes: [
    {
      id: "t1",
      expense_id: expense.id,
      tax_type: "CGST" as const,
      rate: 9,
      amount: 9,
      jurisdiction: "TN",
    },
  ],
  vendors: [
    {
      id: "v1",
      name: "Acme Tools",
      tax_id: "33ABCDE1234F1Z5",
      tax_id_type: "GSTIN" as const,
      country: "IN",
    },
  ],
  categories: [
    { id: "c1", name: "Tooling & Inserts", zoho_account_name: "Consumables" },
  ],
  businesses: [
    { id: "b1", name: "acb", gstin: "33ABCDE1234F1Z5" },
  ],
  profiles: [{ id: "p1", full_name: "Owner" }],
};

describe("buildRecordsWorkbook", () => {
  it("produces a 3-sheet workbook with a row per record / line / tax", async () => {
    const buf = await buildRecordsWorkbook(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Records",
      "Line items",
      "Taxes",
      "Additional fields",
    ]);

    const records = wb.getWorksheet("Records")!;
    expect(records.rowCount).toBe(2); // header + 1
    const row = records.getRow(2).values as unknown[];
    expect(row).toContain("acb"); // business name
    expect(row).toContain("Purchase Order"); // "invoice" record type is relabelled
    expect(row).toContain("INV-9");
    expect(row).toContain("Acme Tools");
    expect(row).toContain("Tooling & Inserts");
    expect(row).toContain(118);

    expect(wb.getWorksheet("Line items")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Taxes")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Additional fields")!.rowCount).toBe(3); // header + 2
  });

  it("handles an empty dataset", async () => {
    const buf = await buildRecordsWorkbook({
      expenses: [],
      lineItems: [],
      taxes: [],
      vendors: [],
      categories: [],
      businesses: [],
      profiles: [],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    expect(wb.getWorksheet("Records")!.rowCount).toBe(1); // header only
  });
});
