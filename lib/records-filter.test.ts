import { describe, expect, it } from "vitest";
import {
  buildTextSearchOr,
  hasActiveRecordFilters,
  likeValue,
  parseRecordFilters,
} from "./records-filter";

describe("parseRecordFilters", () => {
  it("returns all-empty for no params", () => {
    const f = parseRecordFilters({});
    expect(hasActiveRecordFilters(f)).toBe(false);
    expect(f).toEqual({
      q: "",
      from: null,
      to: null,
      categoryId: null,
      vendorId: null,
      status: null,
      country: null,
    });
  });

  it("trims and length-caps the search term", () => {
    expect(parseRecordFilters({ q: "  hello  " }).q).toBe("hello");
    expect(parseRecordFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("accepts only YYYY-MM-DD dates", () => {
    expect(parseRecordFilters({ from: "2026-04-01" }).from).toBe("2026-04-01");
    expect(parseRecordFilters({ from: "2026-4-1" }).from).toBeNull();
    expect(parseRecordFilters({ from: "not-a-date" }).from).toBeNull();
    expect(parseRecordFilters({ from: "2026-13-40" }).from).toBeNull();
  });

  it("swaps a backwards date range", () => {
    const f = parseRecordFilters({ from: "2026-12-31", to: "2026-01-01" });
    expect(f.from).toBe("2026-01-01");
    expect(f.to).toBe("2026-12-31");
  });

  it("keeps ids only when they look like UUIDs", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    expect(parseRecordFilters({ category: uuid }).categoryId).toBe(uuid);
    expect(parseRecordFilters({ category: "1 OR 1=1" }).categoryId).toBeNull();
    expect(parseRecordFilters({ vendor: "../../etc" }).vendorId).toBeNull();
  });

  it("accepts a status only from the known set", () => {
    expect(parseRecordFilters({ status: "confirmed" }).status).toBe("confirmed");
    expect(parseRecordFilters({ status: "deleted" }).status).toBeNull();
  });

  it("normalises country and rejects junk", () => {
    expect(parseRecordFilters({ country: "in" }).country).toBe("IN");
    expect(parseRecordFilters({ country: "United States" }).country).toBe(
      "UNITED STATES",
    );
    expect(parseRecordFilters({ country: "I" }).country).toBeNull();
    expect(parseRecordFilters({ country: "US1" }).country).toBeNull();
    expect(parseRecordFilters({ country: "A".repeat(40) }).country).toBeNull();
  });

  it("takes the first value when a param repeats", () => {
    expect(parseRecordFilters({ status: ["confirmed", "review"] }).status).toBe(
      "confirmed",
    );
  });
});

describe("likeValue / buildTextSearchOr", () => {
  it("quotes the term and escapes quotes and backslashes", () => {
    expect(likeValue("acme, inc.")).toBe('"%acme, inc.%"');
    expect(likeValue('a"b')).toBe('"%a\\"b%"');
    expect(likeValue("a\\b")).toBe('"%a\\\\b%"');
  });

  it("returns empty when there is no term", () => {
    expect(buildTextSearchOr("", ["x"])).toBe("");
  });

  it("builds an invoice-number / notes OR group", () => {
    expect(buildTextSearchOr("bolt", [])).toBe(
      'invoice_number.ilike."%bolt%",notes.ilike."%bolt%"',
    );
  });

  it("folds matched vendor ids into the OR group", () => {
    expect(buildTextSearchOr("bolt", ["v1", "v2"])).toBe(
      'invoice_number.ilike."%bolt%",notes.ilike."%bolt%",vendor_id.in.(v1,v2)',
    );
  });

  it("neutralises filter-grammar punctuation in the term", () => {
    // commas / parens that would otherwise split or inject conditions end up
    // inside the quoted value, not as new filter clauses.
    const out = buildTextSearchOr("a),status.eq.confirmed,(b", []);
    expect(out).toBe(
      'invoice_number.ilike."%a),status.eq.confirmed,(b%",notes.ilike."%a),status.eq.confirmed,(b%"',
    );
  });
});
