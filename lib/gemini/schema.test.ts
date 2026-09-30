import { describe, expect, it } from "vitest";
import { extractionResultSchema } from "./schema";

const parse = (o: Record<string, unknown>) =>
  extractionResultSchema.parse({ suggested_record_type: "invoice", ...o });

describe("extractionResultSchema hardening", () => {
  it("nulls numbers that would overflow the database columns", () => {
    const r = parse({
      total: 1e15,
      subtotal: "9,999,999,999,999,999",
      tax_total: 1234.567,
      line_items: [{ quantity: 1e12, tax_rate: 50000, amount: -500 }],
    });
    expect(r.total).toBeNull();
    expect(r.subtotal).toBeNull();
    expect(r.tax_total).toBe(1234.57);
    expect(r.line_items[0]).toMatchObject({
      quantity: null,
      tax_rate: null,
      amount: -500,
    });
  });

  it("rejects non-finite and junk numbers", () => {
    const r = parse({ total: "abc", subtotal: "Infinity", tax_total: "1,250.50" });
    expect(r.total).toBeNull();
    expect(r.subtotal).toBeNull();
    expect(r.tax_total).toBe(1250.5);
  });

  it("only keeps real calendar dates", () => {
    expect(parse({ invoice_date: "2026-09-23" }).invoice_date).toBe("2026-09-23");
    expect(parse({ invoice_date: "2026-02-31" }).invoice_date).toBeNull();
    expect(parse({ invoice_date: "23/09/2026" }).invoice_date).toBeNull();
    expect(parse({ due_date: "0001-01-01" }).due_date).toBeNull();
  });

  it("validates currency and country codes", () => {
    expect(parse({ currency: " inr ", vendor_country: "in" })).toMatchObject({
      currency: "INR",
      vendor_country: "IN",
    });
    expect(parse({ currency: "Rupees", vendor_country: "India" })).toMatchObject({
      currency: null,
      vendor_country: null,
    });
  });

  it("strips NUL/control characters and caps text length", () => {
    const r = parse({
      vendor_name: "Acme\u0000 Tools\u0007",
      notes: "n".repeat(5000),
    });
    expect(r.vendor_name).toBe("Acme Tools");
    expect(r.notes).toHaveLength(2000);
  });

  it("accepts numbers where text is expected and caps row counts", () => {
    const r = parse({
      invoice_number: 12345,
      line_items: Array.from({ length: 500 }, () => ({ description: "x" })),
    });
    expect(r.invoice_number).toBe("12345");
    expect(r.line_items).toHaveLength(200);
  });

  it("drops out-of-range confidence", () => {
    expect(parse({ confidence: 87 }).confidence).toBeNull();
    expect(parse({ confidence: 0.87 }).confidence).toBe(0.87);
  });
});
