import { describe, expect, it } from "vitest";
import { normalizeVendorName } from "./match";

describe("normalizeVendorName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeVendorName("  ACME   Tools  ")).toBe("acme tools");
  });

  it("turns punctuation into word separators", () => {
    expect(normalizeVendorName("A.B.C. Traders")).toBe("a b c traders");
  });

  it("drops common company suffixes", () => {
    expect(normalizeVendorName("Sharp Edge Private Limited")).toBe("sharp edge");
    expect(normalizeVendorName("Sharp Edge Pvt. Ltd.")).toBe("sharp edge");
    expect(normalizeVendorName("Nakamura Tome LLP")).toBe("nakamura tome");
    expect(normalizeVendorName("Kennametal India Ltd.")).toBe("kennametal india");
  });

  it("treats a standalone 'and' as noise", () => {
    expect(normalizeVendorName("Nuts and Bolts")).toBe("nuts bolts");
  });

  it("collapses two spellings of one suffixed vendor to the same key", () => {
    expect(normalizeVendorName("Precision Grind Pvt Ltd")).toBe(
      normalizeVendorName("Precision Grind Private Limited"),
    );
  });
});
