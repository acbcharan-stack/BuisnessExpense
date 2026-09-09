import { describe, expect, it } from "vitest";
import {
  domesticGstSplit,
  gstinChecksumChar,
  gstStateCode,
  isValidGstin,
  itcEligibleAmount,
} from "./gst";
import {
  financialYearFromStart,
  financialYearOf,
  fiscalQuarterOf,
  isInFinancialYear,
} from "./fy";

describe("isValidGstin", () => {
  it("accepts well-formed checksum-valid GSTINs", () => {
    // Public reference GSTIN of a well-known taxpayer (checksum-valid)
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    // GSTINs whose 15th char we derive from the algorithm itself
    for (const body of ["33AAAAA0000A1Z", "29AABCT1332L1Z", "07AAACB2894G1Z"]) {
      expect(isValidGstin(body + gstinChecksumChar(body))).toBe(true);
    }
  });

  it("is case-insensitive and trims", () => {
    expect(isValidGstin("  27aapfu0939f1zv  ")).toBe(true);
  });

  it("rejects wrong length / shape", () => {
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("")).toBe(false);
    expect(isValidGstin(null)).toBe(false);
    expect(isValidGstin("ABCDEFGHIJKLMNO")).toBe(false);
  });

  it("rejects a bad checksum digit", () => {
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
  });

  it("rejects an unknown state code", () => {
    expect(isValidGstin("00AAPFU0939F1ZV")).toBe(false);
  });
});

describe("gstinChecksumChar", () => {
  it("computes the 15th character", () => {
    expect(gstinChecksumChar("27AAPFU0939F1Z")).toBe("V");
  });
});

describe("gstStateCode", () => {
  it("returns the 2-digit prefix", () => {
    expect(gstStateCode("33AAAAA0000A1Z5")).toBe("33");
    expect(gstStateCode(null)).toBeNull();
  });
});

describe("domesticGstSplit", () => {
  it("intra-state supply -> CGST + SGST", () => {
    expect(domesticGstSplit("33AAAAA0000A1Z5", "33")).toBe("cgst_sgst");
  });
  it("inter-state supply -> IGST", () => {
    expect(domesticGstSplit("27AAPFU0939F1ZV", "33")).toBe("igst");
  });
  it("unknown supplier -> IGST", () => {
    expect(domesticGstSplit(null, "33")).toBe("igst");
  });
});

describe("itcEligibleAmount", () => {
  it("sums GST components, ignores others", () => {
    const lines = [
      { tax_type: "CGST", amount: 90 },
      { tax_type: "SGST", amount: 90 },
      { tax_type: "IGST", amount: 0 },
      { tax_type: "OTHER", amount: 50 },
      { tax_type: "CESS", amount: 10 },
    ];
    expect(itcEligibleAmount(lines)).toBe(190);
  });
});

describe("financial year", () => {
  it("April 2025 is in FY 2025-26", () => {
    const fy = financialYearOf(new Date(2025, 3, 5));
    expect(fy.label).toBe("2025-26");
    expect(fy.startYear).toBe(2025);
  });
  it("March 2025 is in FY 2024-25", () => {
    expect(financialYearOf(new Date(2025, 2, 31)).label).toBe("2024-25");
  });
  it("financialYearFromStart builds the right window", () => {
    const fy = financialYearFromStart(2025);
    expect(fy.start.getTime()).toBe(new Date(2025, 3, 1).getTime());
    expect(fy.end.getTime()).toBe(new Date(2026, 3, 1).getTime());
  });
  it("isInFinancialYear boundary checks", () => {
    expect(isInFinancialYear(new Date(2025, 3, 1), 2025)).toBe(true);
    expect(isInFinancialYear(new Date(2026, 2, 31), 2025)).toBe(true);
    expect(isInFinancialYear(new Date(2026, 3, 1), 2025)).toBe(false);
    expect(isInFinancialYear(new Date(2025, 2, 31), 2025)).toBe(false);
  });
  it("fiscal quarters", () => {
    expect(fiscalQuarterOf(new Date(2025, 3, 1)).quarter).toBe(1); // Apr
    expect(fiscalQuarterOf(new Date(2025, 6, 1)).quarter).toBe(2); // Jul
    expect(fiscalQuarterOf(new Date(2025, 9, 1)).quarter).toBe(3); // Oct
    expect(fiscalQuarterOf(new Date(2026, 0, 1)).quarter).toBe(4); // Jan
    expect(fiscalQuarterOf(new Date(2026, 0, 1)).fy).toBe("2025-26");
  });
});
