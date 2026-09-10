# Phase 3 progress — Reporting + export

_Started 2026-09-10. Plan: `~/.claude/plans/wobbly-twirling-dragonfly.md` §Phase 3._

Standing rules for every item here: treat all browser/URL input as hostile,
add industry-standard protections automatically (validation, bounds, auth +
role checks on every server entry point), no shortcuts, never break existing
behaviour, run `npm run typecheck && npm run lint && npm run test && npm run build`
before committing. See project memory `security-standards.md`.

## Checklist

- [x] 1. Pagination + prev/next nav on Purchase Orders & Expenses lists
- [ ] 2. List filters — date range, category, vendor, status, country, text search
- [ ] 3. CSV export — plain-CSV option alongside the existing .xlsx, same filters
- [ ] 4. Zoho Books CSV — export in Zoho's Bills/Expenses import layout
- [ ] 5. Settings editor — make the category -> Zoho-account mapping table editable
- [ ] 6. Dashboard tax tile — ITC-eligible GST per quarter and full FY
- [ ] 7. Dashboard toggle — All / Purchase Orders / Expenses
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
