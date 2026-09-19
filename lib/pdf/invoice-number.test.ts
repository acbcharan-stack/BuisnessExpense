import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, fyLabelFor } from "./invoice-number";

describe("fyLabelFor", () => {
  it("uses the Apr-start financial year", () => {
    expect(fyLabelFor(new Date(Date.UTC(2026, 3, 1)))).toBe("2026-27"); // Apr
    expect(fyLabelFor(new Date(Date.UTC(2026, 2, 31)))).toBe("2025-26"); // Mar
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads the sequence to 4 digits", () => {
    const n = formatInvoiceNumber({
      invoicePrefix: "ACB",
      businessName: "acb",
      direction: "purchase",
      fyLabel: "2025-26",
      seq: 7,
    });
    expect(n).toBe("ACB/PI/2025-26/0007");
  });

  it("falls back to a derived prefix from the business name when unset", () => {
    const n = formatInvoiceNumber({
      invoicePrefix: null,
      businessName: "boon crafts",
      direction: "sale",
      fyLabel: "2025-26",
      seq: 1,
    });
    expect(n).toBe("BOONCR/SI/2025-26/0001"); // derived prefix caps at 6 chars
  });

  it("uses the correct direction code", () => {
    const purchase = formatInvoiceNumber({
      invoicePrefix: "X",
      businessName: "x",
      direction: "purchase",
      fyLabel: "2025-26",
      seq: 1,
    });
    const sale = formatInvoiceNumber({
      invoicePrefix: "X",
      businessName: "x",
      direction: "sale",
      fyLabel: "2025-26",
      seq: 1,
    });
    expect(purchase).toContain("/PI/");
    expect(sale).toContain("/SI/");
  });
});
