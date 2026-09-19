import { describe, expect, it } from "vitest";
import { recordFormSchema } from "./form-schema";

const base = {
  record_type: "expense" as const,
  vendor_name: "  Acme Tools  ",
  category_id: "",
  new_category_name: "",
  invoice_number: "INV-1",
  invoice_date: "2026-08-01",
  due_date: "",
  currency: "inr",
  country: "in",
  subtotal: "1,200.50",
  tax_total: "",
  total: 1416.59,
  notes: "",
  line_items: [],
  taxes: [],
};

describe("recordFormSchema", () => {
  it("normalises a valid payload", () => {
    const r = recordFormSchema.parse(base);
    expect(r.vendor_name).toBe("Acme Tools");
    expect(r.currency).toBe("INR");
    expect(r.country).toBe("IN");
    expect(r.subtotal).toBe(1200.5); // comma stripped
    expect(r.tax_total).toBeNull(); // "" -> null
    expect(r.custom_fields).toEqual([]); // defaulted
  });

  it("rejects a money value beyond numeric(14,2)", () => {
    const r = recordFormSchema.safeParse({ ...base, total: "1000000000000000" });
    expect(r.success).toBe(false);
  });

  it("rejects a badly formatted date", () => {
    const r = recordFormSchema.safeParse({ ...base, invoice_date: "01/08/2026" });
    expect(r.success).toBe(false);
  });

  it("keeps only labelled custom fields shape and trims", () => {
    const r = recordFormSchema.parse({
      ...base,
      custom_fields: [
        { label: "  PO number ", value: " PO-9 " },
        { label: "", value: "" },
      ],
    });
    expect(r.custom_fields).toEqual([
      { label: "PO number", value: "PO-9" },
      { label: null, value: null },
    ]);
  });
});
