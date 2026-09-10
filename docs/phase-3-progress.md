# Phase 3 progress — Reporting + export

_Started 2026-09-10. Plan: `~/.claude/plans/wobbly-twirling-dragonfly.md` §Phase 3._

Standing rules for every item here: treat all browser/URL input as hostile,
add industry-standard protections automatically (validation, bounds, auth +
role checks on every server entry point), no shortcuts, never break existing
behaviour, run `npm run typecheck && npm run lint && npm run test && npm run build`
before committing. See project memory `security-standards.md`.

## Checklist

- [x] 1. Pagination + prev/next nav on Purchase Orders & Expenses lists
- [x] 2. List filters — date range, category, vendor, status, country, text search
- [x] 3. CSV export — plain-CSV option alongside the existing .xlsx, same filters
- [ ] 4. Zoho Books CSV — export in Zoho's Bills/Expenses import layout
      **(deferred — user: "we will do this later"; needs their real Zoho import
      template header row. Decided: Bills format for POs, Expenses format for
      expenses.)**
- [ ] 5. Settings editor — make the category -> Zoho-account mapping table
      editable **(deferred with item 4 — it feeds the Zoho export)**
- [x] 6. Dashboard tax tile — ITC-eligible GST per quarter and full FY
- [x] 7. Dashboard toggle — All / Purchase Orders / Expenses
- [ ] 8. Dashboard charts — monthly trend line, category donut, top-vendors bar

## What was already done before Phase 3 work started

- Dashboard: quarter cards + FY total, PO vs expense count/value tiles, pending-review alert.
- India FY helpers in `lib/tax/fy.ts` (`financialYearOf`, `fiscalQuarterOf`).
- `itcEligibleAmount()` in `lib/tax/gst.ts` (tested, not yet shown in UI).
- Excel (.xlsx) export in `app/api/export/route.ts` + `lib/export/records-workbook.ts`
  (Records / Line items / Taxes / Additional fields sheets; `type` + `business` filters;
  single-record export by `id`; bulk export is owner/accountant only).
- `?business=` filter across dashboard + both list pages (`BusinessTabs`, `isUuid()`).

## Log

### 2026-09-10 — Item 1: list pagination + faster business-tab navigation

**Pagination**
- `lib/pagination.ts` (new) — `RECORDS_PAGE_SIZE = 50`, `MAX_PAGE_NUMBER = 200`,
  `parsePageParam()` (coerces an untrusted `?page=` to an int in `[1, 200]`;
  handles `NaN`, negatives, `1e9`, arrays), `pageCountFor()`.
- `components/list-pager.tsx` (new) — client Prev/Next control. Rebuilds the URL
  from `useSearchParams()` so it carries every other active filter across; drops
  `page` when it's 1. Disabled ends render as `<span>`, not a dead link.
- `app/(app)/records-list.tsx` — `.range(from, to)` + `{ count: "exact" }`
  instead of `.limit(100)`; secondary `.order("created_at", desc)` so rows can't
  shuffle between pages. Extra branch: a high page that lands empty (data shrank)
  shows a "step back with Prev" card + the pager, not the empty-state.
- `invoices/page.tsx` / `expenses/page.tsx` — thread `?page=` through to
  `<RecordsList pageParam={page} />`.

**Business-tab / paging navigation speed**
- `next.config.ts` — `experimental.staleTimes { dynamic: 30, static: 180 }`.
  Prefetched dynamic pages now sit in the client Router Cache for 3 min instead
  of 0, so bouncing between business tabs reuses fetched data.
- `components/business-tabs.tsx` + `components/list-pager.tsx` — `prefetch` on the
  `<Link>`s. Tabs are always on-screen, so every business view is prefetched with
  its data up front; the click is then instant. (Prefetch is production-only —
  no change in `next dev`.)
- `lib/supabase/auth.ts` — `getCurrentUser` / `requireProfile` wrapped in React
  `cache()`. The app layout and the page inside it both call `requireProfile()`;
  now that's one `auth.getUser()` + one `profiles` query per request, not two.
  No API change, still verified fresh on every request.

Security choices, in plain terms:
- **Page number is treated as hostile.** `parsePageParam` is a bouncer that only
  accepts a whole number between 1 and 200 and turns anything else into "1", so a
  crafted `?page=99999999` can't make the database grind through a giant offset.
- **Auth still checked every visit.** The `cache()` wrapper only stops the *same*
  request from asking twice; a new page load re-verifies the login token.
- **Caching stays short for live data.** 30s on dynamic views means the Inbox and
  record lists are never meaningfully stale.

Checks: `typecheck`, `lint`, `test` (27), `build` all pass.
Commit `c9a7263` (push blocked — machine git creds are for `kraftsboon`, not
`acbcharan-stack`; user to `git push origin main` once that's fixed).

### 2026-09-10 — Item 2: list filters

- `lib/records-filter.ts` (new) — `RecordFilters` type + `parseRecordFilters()`
  (validates every URL value: `q` trimmed + 100-char cap; `from`/`to` must be
  `YYYY-MM-DD` and are swapped if reversed; `category`/`vendor` must be UUIDs;
  `status` must be in `EXPENSE_STATUSES`; `country` letters+spaces ≤32, upper).
  `buildTextSearchOr()` / `likeValue()` build the one PostgREST `.or()` string,
  double-quoting + backslash-escaping the term so `,` `.` `(` `)` `"` in a search
  can't split or inject filter clauses. `lib/records-filter.test.ts` — 13 cases.
- `components/records-filters.tsx` (new) — plain GET `<form>`, no client JS.
  Search / from / to / category / vendor / status / country(when >1 present).
  Hidden `business` input keeps the tab; omitting `page` resets to page 1;
  "Clear" link drops every filter but the business tab.
- `app/(app)/records-list.tsx` — `loadRecordListChrome(supabase, recordType)`
  (businesses + category/vendor options + distinct country codes in one
  round trip). `RecordsList` takes `filters`, resolves vendor-name matches to
  ids first (capped at 300), then applies `.gte/.lte/.eq/.or`. Empty result with
  active filters shows "no match — Clear filters", not the first-run empty state.
- `invoices/page.tsx` / `expenses/page.tsx` — parse filters, load chrome in the
  same `Promise.all` as auth, render `<RecordsFilters>` above the table.

Security choices, plainly:
- **Every filter box is retyped onto our own form.** A date that isn't a real
  `YYYY-MM-DD`, an id that isn't a UUID, a status we don't recognise — all
  dropped, not passed on.
- **The search term can't smuggle in commands.** It only ever reaches the
  database wrapped in quotes with its special characters defanged, so typing
  `"), status.eq.confirmed, ("` just searches for that text.
- **Lists stay bounded.** Search folds in at most 300 matching vendors; the
  vendor dropdown caps at 1000; the country scan at 5000 rows.

Checks: `typecheck`, `lint`, `test` (40), `build` all pass.

### 2026-09-10 — Item 3: CSV export + filter-aware exports

- `lib/export/records-csv.ts` (new, + test) — `buildRecordsCsv()`, a flat
  one-row-per-record CSV with the same columns as the workbook's "Records"
  sheet. `cell()` guards every value: a leading `= + - @` / tab / CR gets a `'`
  prefix (formula-injection), and anything with `" , \n` is quoted with doubled
  quotes (column break-out). UTF-8 BOM + CRLF so Excel opens ₹ / non-ASCII
  cleanly. 5 tests, incl. `=CMD|'/C calc'!A0`.
- `lib/records-filter.ts` — extracted `applyRecordFilters()` (business + all six
  list filters onto an `expenses` query) and `resolveTextVendorIds()` so the
  list page and the export route share one implementation. `records-list.tsx`
  refactored onto them (no behaviour change).
- `app/api/export/route.ts` — `?format=csv` (default xlsx); bulk export now runs
  the URL's list filters through `parseRecordFilters` + `applyRecordFilters`, so
  "Export" gives you the rows you're actually looking at. CSV path skips the
  line-item / tax child fetches. Filename extension follows the format.
- `components/export-button.tsx` — now two buttons, **Excel** and **CSV**,
  sharing the busy state; a bulk export copies `business` + `q/from/to/category/
  vendor/status/country` from the current URL into the request.

Security choices, plainly:
- **A spreadsheet can't run what's in an exported cell.** Any value that looks
  like a formula is turned into plain text first, so a malicious vendor name on
  a scanned bill can't fire when the accountant opens the file.
- **Values can't jump columns.** Quotes/commas/newlines are escaped, so a note
  with a comma stays one cell.
- **Export obeys the same gate + the same validation as the list.** Bulk export
  is still owner/accountant only; the forwarded filters go through the exact
  `parseRecordFilters` the tables use.

Checks: `typecheck`, `lint`, `test` (45), `build` all pass.

### 2026-09-10 — Items 6 + 7: dashboard ITC tile + record-type toggle

- `lib/tax/gst.ts` — exported `ITC_TAX_TYPES` (`CGST/SGST/IGST/CESS`), reused by
  `itcEligibleAmount` and the dashboard.
- `dashboard/page.tsx` — new **"GST input tax credit"** section: same 4-quarter
  card layout as Spend, plus an FY total. Sums `expense_taxes.amount` for the
  ITC types on this FY's confirmed/exported **domestic** (`country` = IN) records,
  bucketed by quarter. Records are date-bucketed once (`quarterOfExpense` map)
  and reused; `expense_taxes` fetched in 200-id chunks with a `tax_type` filter.
- `components/record-view-tabs.tsx` (new) — All / Purchase orders / Expenses
  segmented control on `?view=` (`invoice` | `expense` | absent), preserves
  other params, `prefetch`.
- `dashboard/page.tsx` — `byView()` helper (mirrors `byBiz()`); applied to the
  Awaiting-review + Records-captured counts and the spend/ITC roll-up. The
  PO-vs-Expense split tiles stay global on purpose.

Security choices, plainly:
- **`?view=` is checked against a fixed list.** Only `invoice` / `expense` do
  anything; any other value falls back to "all", so the URL can't smuggle a
  different column or value into the query.
- **The tax figure only trusts its own maths.** Amounts are coerced with
  `Number()` and skipped unless finite, and only the four creditable GST types
  are counted.

Checks: `typecheck`, `lint`, `test` (45), `build` all pass.
