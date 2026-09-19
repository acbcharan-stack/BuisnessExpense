import { describe, expect, it } from "vitest";
import { generatedInvoiceFormSchema } from "./form-schema";

const base = {
  direction: "purchase" as const,
  business_id: "11111111-1111-1111-1111-111111111111",
  counterparty: {
    name: "  Acme Tools  ",
    tax_id: "33AAAAA0000A1Z5",
    tax_id_type: "GSTIN" as const,
    address: "1 Vendor Street",
    country: "in",
  },
  our_business: {
    name: "acb",
    legal_name: "ACB Precision Engineering",
    gstin: "33BBBBB0000B1Z5",
    gst_state_code: "33",
    address: "1 Shop Road",
    bank_account_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_name: "",
    signature_storage_path: "",
    logo_storage_path: "",
    terms_and_conditions: "",
  },
  our_invoice_date: "2026-09-18",
  currency: "inr",
  subtotal: "1,000",
  tax_total: "180",
  total: 1180,
  notes: "",
  line_items: [],
  taxes: [],
};

describe("generatedInvoiceFormSchema", () => {
  it("normalises a valid payload", () => {
    const r = generatedInvoiceFormSchema.parse(base);
    expect(r.counterparty.name).toBe("Acme Tools");
    expect(r.counterparty.country).toBe("IN");
    expect(r.currency).toBe("INR");
    expect(r.subtotal).toBe(1000);
    expect(r.our_business.bank_account_number).toBeNull();
  });

  it("only accepts a purchase invoice (a client can't request any other direction)", () => {
    expect(
      generatedInvoiceFormSchema.safeParse({ ...base, direction: "sale" }).success,
    ).toBe(false);
    expect(
      generatedInvoiceFormSchema.safeParse({ ...base, direction: "lease" }).success,
    ).toBe(false);
  });

  it("requires a counterparty name", () => {
    const r = generatedInvoiceFormSchema.safeParse({
      ...base,
      counterparty: { ...base.counterparty, name: "   " },
    });
    expect(r.success).toBe(false);
  });

  it("requires a business to be chosen", () => {
    const r = generatedInvoiceFormSchema.safeParse({ ...base, business_id: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a badly formatted invoice date", () => {
    const r = generatedInvoiceFormSchema.safeParse({
      ...base,
      our_invoice_date: "18/09/2026",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a money value beyond numeric(14,2)", () => {
    const r = generatedInvoiceFormSchema.safeParse({
      ...base,
      total: "1000000000000000",
    });
    expect(r.success).toBe(false);
  });
});
