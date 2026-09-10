/**
 * Filters for the Purchase Orders / Expenses list pages.
 *
 * Every value here arrives in the URL, so it is attacker-controlled. Nothing in
 * this module trusts its input: dates must match a strict shape, ids must look
 * like UUIDs, the status must be one of the known values, the country is two
 * letters, and the free-text term is length-capped. `applyRecordFilters` only
 * ever passes these cleaned values to the query builder as *values*, never
 * splices them into a raw filter string — see `buildTextSearchOr` for the one
 * place text reaches PostgREST's filter grammar, where it is quoted and escaped.
 *
 * Metaphor: the URL is a stack of forms filled in by a stranger. We retype every
 * field onto our own clean form, in our own handwriting, dropping anything that
 * isn't a plain answer to the question asked.
 */

import { isUuid } from "@/lib/uuid";
import { EXPENSE_STATUSES, type ExpenseStatus } from "@/lib/types";

export interface RecordFilters {
  /** Free text — matched against invoice number, notes and vendor name. */
  q: string;
  /** Inclusive invoice-date lower bound, `YYYY-MM-DD`, or null. */
  from: string | null;
  /** Inclusive invoice-date upper bound, `YYYY-MM-DD`, or null. */
  to: string | null;
  categoryId: string | null;
  vendorId: string | null;
  status: ExpenseStatus | null;
  /** ISO-ish 2-letter country code, upper-cased, or null. */
  country: string | null;
}

export const EMPTY_RECORD_FILTERS: RecordFilters = {
  q: "",
  from: null,
  to: null,
  categoryId: null,
  vendorId: null,
  status: null,
  country: null,
};

/** Longest free-text term we will act on. Keeps the `ILIKE` bounded. */
export const MAX_SEARCH_LEN = 100;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

function validDate(raw: string): string | null {
  if (!DATE_RE.test(raw)) return null;
  const t = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(t) ? raw : null;
}

/** Parse + validate the list filters from raw search params. Never throws. */
export function parseRecordFilters(sp: RawParams): RecordFilters {
  const q = one(sp.q).slice(0, MAX_SEARCH_LEN);

  let from = validDate(one(sp.from));
  let to = validDate(one(sp.to));
  // A backwards range is almost certainly a slip — swap rather than return zero
  // rows with no explanation.
  if (from && to && from > to) [from, to] = [to, from];

  const category = one(sp.category);
  const vendor = one(sp.vendor);
  const statusRaw = one(sp.status);
  // Stored country values are usually the 2-letter code "IN", but the review
  // form lets a name through ("UNITED STATES"), so accept letters + spaces up to
  // a sane length. The value is only ever used as an `.eq()` argument.
  const countryRaw = one(sp.country).toUpperCase();

  return {
    q,
    from,
    to,
    categoryId: isUuid(category) ? category : null,
    vendorId: isUuid(vendor) ? vendor : null,
    status: (EXPENSE_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ExpenseStatus)
      : null,
    country: /^[A-Z][A-Z ]{1,31}$/.test(countryRaw) ? countryRaw : null,
  };
}

/** True when at least one filter is doing something. */
export function hasActiveRecordFilters(f: RecordFilters): boolean {
  return Boolean(
    f.q ||
      f.from ||
      f.to ||
      f.categoryId ||
      f.vendorId ||
      f.status ||
      f.country,
  );
}

/**
 * Build the value side of a PostgREST `ILIKE` for use inside an `.or(...)`
 * group. The term is wrapped in double quotes and `\` / `"` are backslash-
 * escaped, which is exactly how PostgREST allows the reserved characters
 * `, . : ( )` to appear literally in a value. Result e.g. `"%acme, inc.%"`.
 */
export function likeValue(term: string): string {
  const escaped = term.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/**
 * The `.or(...)` filter string for the free-text search: invoice number OR notes
 * OR (optionally) a vendor whose name matched. `matchedVendorIds` are resolved
 * separately by the caller (they must be UUIDs straight from the DB, so they are
 * safe to join). Returns "" when there is nothing to search.
 */
export function buildTextSearchOr(
  q: string,
  matchedVendorIds: string[],
): string {
  if (!q) return "";
  const v = likeValue(q);
  const parts = [`invoice_number.ilike.${v}`, `notes.ilike.${v}`];
  if (matchedVendorIds.length > 0) {
    parts.push(`vendor_id.in.(${matchedVendorIds.join(",")})`);
  }
  return parts.join(",");
}
