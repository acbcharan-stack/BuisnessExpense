import { describe, expect, it } from "vitest";
import { buildRecordsCsv } from "./records-csv";
import type { ExpenseRow } from "@/lib/supabase/database.types";

function makeExpense(partial: Partial<ExpenseRow>): ExpenseRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    document_id: null,
    business_id: null,
    vendor_id: null,
    category_id: null,
    record_type: "expense",
    expense_type: null,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    currency: "INR",
    country: "IN",
    subtotal: null,
    tax_total: null,
    total: null,
    fx_rate: 1,
    amount_inr: null,
    notes: null,
    custom_fields: [],
    category_set_by: null,
    status: "confirmed",
    confirmed_by: null,
    confirmed_at: null,
    exported_at: null,
    zoho_reference: null,
    created_at: "2026-04-01T00:00:00+00:00",
    updated_at: "2026-04-01T00:00:00+00:00",
    ...partial,
  };
}

const base = {
  vendors: [],
  categories: [],
  businesses: [],
  profiles: [],
};

/** data rows only (drop the BOM+header line and the trailing blank). */
function dataRows(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n").slice(1);
}

describe("buildRecordsCsv", () => {
  it("starts with a UTF-8 BOM and a header row, CRLF-terminated", () => {
    const csv = buildRecordsCsv({ ...base, expenses: [] });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).startsWith("Business,Business GSTIN,Record type")).toBe(
      true,
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("neutralises a formula-injection value with a leading quote", () => {
    const csv = buildRecordsCsv({
      ...base,
      expenses: [makeExpense({ invoice_number: "=CMD|'/C calc'!A0" })],
    });
    // 5th column is Invoice number; it must be prefixed with ' and, because it
    // now contains no comma/quote, needs no wrapping quotes.
    expect(dataRows(csv)[0].split(",")[4]).toBe("'=CMD|'/C calc'!A0");
  });

  it("quotes and escapes values with commas or quotes", () => {
    const csv = buildRecordsCsv({
      ...base,
      expenses: [
        makeExpense({ notes: 'acme, "special" order' }),
      ],
    });
    expect(csv).toContain('"acme, ""special"" order"');
  });

  it("keeps a plain hyphen-led value quoted but readable", () => {
    const csv = buildRecordsCsv({
      ...base,
      expenses: [makeExpense({ invoice_number: "-42" })],
    });
    expect(dataRows(csv)[0].split(",")[4]).toBe("'-42");
  });

  it("resolves vendor / category / business / confirmer names", () => {
    const csv = buildRecordsCsv({
      expenses: [
        makeExpense({
          vendor_id: "v1",
          category_id: "c1",
          business_id: "b1",
          confirmed_by: "p1",
          total: 1200.5,
        }),
      ],
      vendors: [
        {
          id: "v1",
          name: "Tata Steel",
          tax_id: "27AAAAA0000A1Z5",
          tax_id_type: "GSTIN",
          country: "IN",
        },
      ],
      categories: [
        { id: "c1", name: "Raw Material", zoho_account_name: "Cost of Goods Sold" },
      ],
      businesses: [{ id: "b1", name: "acb", gstin: "33BBBBB1111B1Z5" }],
      profiles: [{ id: "p1", full_name: "Charan" }],
    });
    const cols = dataRows(csv)[0].split(",");
    expect(cols[0]).toBe("acb");
    expect(cols[7]).toBe("Tata Steel");
    expect(cols[10]).toBe("Raw Material");
    expect(cols[16]).toBe("1200.5");
  });
});
