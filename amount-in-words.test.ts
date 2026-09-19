import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words";

describe("amountInWords", () => {
  it("matches the worked example from the spec", () => {
    expect(amountInWords(67118, "INR")).toBe(
      "Rupees Sixty Seven Thousand One Hundred Eighteen Only",
    );
  });

  it("uses Indian lakh grouping", () => {
    expect(amountInWords(100000, "INR")).toBe("Rupees One Lakh Only");
  });

  it("uses Indian crore grouping", () => {
    expect(amountInWords(12345678, "INR")).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
    );
  });

  it("handles zero", () => {
    expect(amountInWords(0, "INR")).toBe("Rupees Zero Only");
  });

  it("handles negative amounts", () => {
    expect(amountInWords(-50, "INR")).toBe("Minus Rupees Fifty Only");
  });

  it("handles paise (decimal) amounts", () => {
    expect(amountInWords(100.5, "INR")).toBe(
      "Rupees One Hundred and Fifty Paise Only",
    );
  });

  it("swaps the currency label for non-INR currencies", () => {
    expect(amountInWords(1000, "USD")).toBe("US Dollars One Thousand Only");
    expect(amountInWords(1000, "XYZ")).toBe("XYZ One Thousand Only");
  });
});
