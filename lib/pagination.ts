/**
 * Shared pagination rules for the record list pages (Purchase Orders / Expenses).
 *
 * Security: the page number travels in the URL, so a visitor can type anything
 * they like into it. We never trust it. `parsePageParam` forces the value to a
 * whole number inside a safe range, so `?page=-4`, `?page=1e9`, `?page=abc` or a
 * repeated `?page=1&page=2` can't push the database into an enormous scan or an
 * out-of-range calculation. Think of it as a cloakroom that only accepts ticket
 * numbers 1 through 200 and rounds anything else back to ticket 1.
 */

/** Rows shown per page on the Purchase Orders / Expenses tables. */
export const RECORDS_PAGE_SIZE = 50;

/**
 * Hard ceiling on the page number. 200 pages x 50 rows = 10,000 records, well
 * past any realistic filtered view, and keeps the SQL OFFSET small.
 */
export const MAX_PAGE_NUMBER = 200;

/** Coerce an untrusted `?page=` value to an integer in [1, MAX_PAGE_NUMBER]. */
export function parsePageParam(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(first);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_PAGE_NUMBER, Math.trunc(n));
}

/** Total number of pages for a given row count (never less than 1). */
export function pageCountFor(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));
}
