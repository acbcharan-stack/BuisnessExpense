import { EXPENSE_STATUSES } from "@/lib/types";
import { Card } from "@/components/ui";
import {
  hasActiveRecordFilters,
  MAX_SEARCH_LEN,
  type RecordFilters,
} from "@/lib/records-filter";

/**
 * Filter bar for the Purchase Orders / Expenses tables. A plain GET `<form>` —
 * no client JavaScript. Submitting reloads the page with the chosen values in
 * the query string, which `parseRecordFilters` then re-validates on the server.
 * `page` is deliberately not carried in the form, so applying a filter always
 * lands you back on page 1.
 */
export function RecordsFilters({
  filters,
  businessFilter,
  categories,
  vendors,
  countries,
}: {
  filters: RecordFilters;
  /** Raw `?business=` value to keep across a filter submit. */
  businessFilter: string;
  categories: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  countries: string[];
}) {
  const active = hasActiveRecordFilters(filters);
  const clearHref = businessFilter
    ? `?business=${encodeURIComponent(businessFilter)}`
    : "?";

  const field =
    "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 dark:border-zinc-700 dark:bg-zinc-900";
  const labelText = "text-[11px] font-medium uppercase tracking-wide text-zinc-500";

  return (
    <Card className="mb-4 p-3">
      <form method="GET" className="flex flex-wrap items-end gap-2.5">
        {businessFilter ? (
          <input type="hidden" name="business" value={businessFilter} />
        ) : null}

        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className={labelText}>Search</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            maxLength={MAX_SEARCH_LEN}
            placeholder="Number, vendor or notes"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelText}>From</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelText}>To</span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelText}>Category</span>
          <select
            name="category"
            defaultValue={filters.categoryId ?? ""}
            className={field}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelText}>Vendor</span>
          <select
            name="vendor"
            defaultValue={filters.vendorId ?? ""}
            className={field}
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelText}>Status</span>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className={field}
          >
            <option value="">Any</option>
            {EXPENSE_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </label>

        {countries.length > 1 ? (
          <label className="flex flex-col gap-1">
            <span className={labelText}>Country</span>
            <select
              name="country"
              defaultValue={filters.country ?? ""}
              className={field}
            >
              <option value="">Any</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 active:scale-[.97] dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            Apply
          </button>
          {active ? (
            <a
              href={clearHref}
              className="h-9 rounded-lg px-3 text-sm font-medium leading-9 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              Clear
            </a>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
