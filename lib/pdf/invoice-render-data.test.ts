import { describe, expect, it } from "vitest";
import { buildInvoiceRenderData } from "./invoice-render-data";
import type {
  CounterpartySnapshot,
  OurBusinessSnapshot,
} from "@/lib/supabase/database.types";

const counterparty: CounterpartySnapshot = {
  name: "Acme Tools",
  tax_id: "33AAAAA0000A1Z5",
  tax_id_type: "GSTIN",
  address: "1 Vendor Street",
  country: "IN",
};

const ourBusiness: OurBusinessSnapshot = {
  name: "acb",
  legal_name: "ACB Precision Engineering",
  gstin: "33BBBBB0000B1Z5",
  gst_state_code: "33",
  address: "1 Shop Road",
  bank_account_name: "ACB Precision Engineering",
  bank_account_number: "1234567890",
  bank_ifsc: "HDFC0000123",
  bank_name: "HDFC Bank",
  signature_storage_path: "signatures/biz-1.png",
  logo_storage_path: "logos/biz-1.png",
  terms_and_conditions: "Payment due within 30 days.",
};

const base = {
  counterparty,
  ourBusiness,
  ourInvoiceNumber: "ACB/PI/2025-26/0001",
  ourInvoiceDate: "2026-04-05",
  currency: "INR",
  lineItems: [],
  taxes: [],
  subtotal: 1000,
  taxTotal: 180,
  total: 1180,
  notes: null,
};

describe("buildInvoiceRenderData", () => {
  it("puts our business as the issuer (letterhead) and the PO supplier as the vendor", () => {
    const r = buildInvoiceRenderData(base);
    expect(r.issuer.name).toBe("acb");
    expect(r.issuer.legalName).toBe("ACB Precision Engineering");
    expect(r.issuer.address).toBe("1 Shop Road");
    expect(r.vendor.name).toBe("Acme Tools");
    expect(r.vendor.address).toBe("1 Vendor Street");
  });

  it("computes the amount-in-words line from the total", () => {
    const r = buildInvoiceRenderData(base);
    expect(r.amountInWords).toBe("Rupees One Thousand One Hundred Eighty Only");
  });

  it("passes through logo, signature and terms from the our-business snapshot", () => {
    const r = buildInvoiceRenderData(base);
    expect(r.logoStoragePath).toBe("logos/biz-1.png");
    expect(r.signatureStoragePath).toBe("signatures/biz-1.png");
    expect(r.termsAndConditions).toBe("Payment due within 30 days.");
  });

  it("falls back to null totals/bank details gracefully", () => {
    const r = buildInvoiceRenderData({
      ...base,
      subtotal: null,
      taxTotal: null,
      total: null,
      ourBusiness: { ...ourBusiness, bank_account_number: null },
    });
    expect(r.subtotal).toBe(0);
    expect(r.taxTotal).toBe(0);
    expect(r.total).toBe(0);
    expect(r.bank).toBeNull();
  });
});
