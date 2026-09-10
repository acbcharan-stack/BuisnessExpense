---
name: reporting-lists-exports
description: >-
  Conventions for the Invoice Scanner reporting layer — record list pages
  (Purchase Orders / Expenses), their pagination + filters, the dashboard, and
  CSV / Excel / Zoho exports. Use when adding or changing any list view,
  dashboard tile/chart, filter, or export.
---

# Reporting, lists & exports — how this app does it

Phase 3 of the plan (`~/.claude/plans/wobbly-twirling-dragonfly.md`). Live
progress + decisions: `docs/phase-3-progress.md`.

## Non-negotiable rules for every change here

1. Everything from the URL / browser is hostile. Validate it before it touches
   the DB (see below).
2. Add the standard protections automatically: input validation, numeric bounds,
   `requireProfile()` + role check on every server entry point.
3. No shortcuts. Production-ready.
4. Explain each security choice with a plain metaphor (in code comments + the
   progress log).
5. Never change the behaviour of unrelated parts of the app.
6. Before committing: `npm run typecheck && npm run lint && npm run test && npm run build`.
7. Log what changed and why in `docs/phase-3-progress.md`; update project memory.

## Where things live

| Concern | File |
| --- | --- |
| Shared list table | `app/(app)/records-list.tsx` (`<RecordsList>`, server component) |
| List pages | `app/(app)/invoices/page.tsx`, `app/(app)/expenses/page.tsx` (thin; parse `searchParams`, render `<BusinessTabs>` + `<RecordsList>`) |
| Pagination rules | `lib/pagination.ts` |
| Prev/Next control | `components/list-pager.tsx` (client) |
| Business filter tabs | `components/business-tabs.tsx` (client, `?business=`) |
| Dashboard | `app/(app)/dashboard/page.tsx` |
| Excel export | `app/api/export/route.ts` + `lib/export/records-workbook.ts` |
| Export button | `components/export-button.tsx` (client, `fetch` + blob download) |
| India FY / quarter helpers | `lib/tax/fy.ts` |
| GST / ITC helpers | `lib/tax/gst.ts` (`itcEligibleAmount`, `domesticGstSplit`, `isValidGstin`) |
| Settings (categories ⇄ Zoho map) | `app/(app)/settings/page.tsx` + `settings/actions.ts` |

## Established patterns

### Untrusted query params

`lib/records-filter.ts` (`parseRecordFilters`) is the worked example — reuse it,
don't reinvent. Rules it follows:

- **ids** (`business`, `category`, `vendor`, `id`): `isUuid()` from `lib/uuid.ts`
  before using. Literal sentinels like `unassigned` are matched explicitly.
- **page**: `parsePageParam()` from `lib/pagination.ts` — clamps to `[1, 200]`,
  rejects `NaN` / negatives / `1e9` / arrays.
- **enums** (`status`, `record_type`, `type`): check membership against the
  arrays in `lib/types.ts` (`EXPENSE_STATUSES`, `RECORD_TYPES`, `TAX_TYPES`).
  Anything not in the list = ignore the filter, don't error.
- **dates** (`from`, `to`): accept only `YYYY-MM-DD` (`/^\d{4}-\d{2}-\d{2}$/`) and
  a finite `Date.parse`; otherwise drop the bound. A reversed range is swapped.
- **country**: upper-case, `/^[A-Z][A-Z ]{1,31}$/` (stored values are usually
  "IN" but the review form allows a name). Only ever an `.eq()` argument.
- **free text** (`q`): trim, cap at `MAX_SEARCH_LEN` (100). For a method call
  like `.ilike("name", `%${q}%`)` supabase-js parameterises the value — safe.
  For the `.or(...)` grammar string use `buildTextSearchOr()` / `likeValue()`,
  which double-quote the term and backslash-escape `\` and `"` so `, . ( ) :`
  can't split or inject clauses. Never string-concat `q` into `.or()` yourself.

### Paginated list query

```ts
const page = parsePageParam(pageParam);
const from = (page - 1) * RECORDS_PAGE_SIZE;
let query = supabase
  .from("expenses")
  .select("...cols...", { count: "exact" })
  .eq("record_type", recordType)
  .order("invoice_date", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false }) // stable tiebreak
  .range(from, from + RECORDS_PAGE_SIZE - 1);
// ...apply validated filters...
const { data: rows, count } = await query;
const pageCount = pageCountFor(count ?? 0);
```

Render `<ListPager page pageCount total={count} />` after the table. A page > 1
that comes back empty shows a "step back" card, not the first-load empty state.

### Navigation speed

Dynamic pages (`export const dynamic = "force-dynamic"`) are re-rendered on the
server every visit. To keep tab / page switching fast:

- `experimental.staleTimes { dynamic: 30, static: 180 }` in `next.config.ts` —
  client Router Cache keeps prefetched pages ~3 min.
- `prefetch` on always-visible `<Link>`s (`BusinessTabs`, `ListPager`) so the
  next view is fetched with its data before the click. Production-only.
- Wrap per-request auth/lookups in React `cache()` (see `lib/supabase/auth.ts`)
  so the layout and page don't each pay for `auth.getUser()`.
- Keep list queries to: one main `.range()` query, then one `Promise.all` for
  vendor / category / business name lookups by id.

### Exports

- All export goes through `app/api/export/route.ts` (`GET`). Auth: `getUser()`;
  **bulk** export (no `?id=`) is owner/accountant only, single record is anyone
  who can open it.
- Filters accepted: `id` (uuid), `type` (`invoice`|`expense`), `business`
  (uuid|`unassigned`). Add new filters by validating them the same way and
  threading into both the `expenses` query and the filename `label`.
- Data is fetched with the **admin client** after the RLS-backed auth check, and
  child rows (`expense_line_items`, `expense_taxes`) are fetched in chunks of 200
  ids (`fetchChildren`) because PostgREST caps URL length.
- Excel is built by `buildRecordsWorkbook`. For CSV / Zoho, add a sibling builder
  in `lib/export/` (e.g. `records-csv.ts`, `zoho-bills-csv.ts`) with unit tests;
  switch on a validated `format` param; set the right `Content-Type` +
  `Content-Disposition`. CSV: quote every field, escape `"` as `""`, prefix a
  leading `=`/`+`/`-`/`@` with `'` to defeat spreadsheet formula injection.
- `ExportButton` downloads via `fetch` + `URL.createObjectURL` so it can show a
  spinner and surface a 403.

### Dashboard

- `financialYearOf(now)` → `{ startYear, label, start, end }`. Quarters are
  `new Date(fy.startYear, 3 + i*3, 1)`. Q1 = Apr–Jun.
- Money: always prefer `amount_inr`; fall back to `total` only when
  `currency === "INR"`. Foreign records without an INR value are excluded from
  totals (state that in the footnote).
- Only `status in ('confirmed','exported')` counts toward spend/tax figures.
- ITC tile = `itcEligibleAmount()` over `expense_taxes` rows
  (`CGST/SGST/IGST/CESS`) joined to confirmed **domestic** (`country = 'IN'` /
  null) expenses, bucketed by the same quarter windows + an FY total.
- `?business=` filter: reuse the `byBiz()` helper pattern already in the page.

## Data model reminders

- `expenses.record_type` `invoice` is shown everywhere as "Purchase Order"
  (`RECORD_TYPE_LABELS` in `lib/types.ts`); the stored value stays `invoice`.
- `expenses.business_id` nullable; `categories.zoho_account_name` nullable;
  seed defaults in `lib/constants.ts` `SEED_CATEGORIES`.
- `extraction_jobs` has no `authenticated` RLS write policy — service-role only.
