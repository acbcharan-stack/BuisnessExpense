import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/page-header";
import { Badge, Card, Icon } from "@/components/ui";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { ListPager } from "@/components/list-pager";
import { isUuid } from "@/lib/uuid";
import {
  RECORDS_PAGE_SIZE,
  pageCountFor,
  parsePageParam,
} from "@/lib/pagination";
import {
  EMPTY_RECORD_FILTERS,
  buildTextSearchOr,
  hasActiveRecordFilters,
  type RecordFilters,
} from "@/lib/records-filter";
import type { RecordType } from "@/lib/types";

/** Cap on vendor-name matches folded into a text search — keeps the URL sane. */
const MAX_VENDOR_MATCHES = 300;

/** Upper bound on rows in the vendor filter dropdown. */
const MAX_VENDOR_OPTIONS = 1000;

/** Rows scanned to derive the set of country codes for the filter dropdown. */
const COUNTRY_SCAN_LIMIT = 5000;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type NamedRow = { id: string; name: string };

/**
 * Data the list pages need around the table itself: the business tabs and the
 * category / vendor filter dropdowns. Fetched in one round trip.
 */
export async function loadRecordListChrome(
  supabase: Supabase,
  recordType: RecordType,
): Promise<{
  businesses: NamedRow[];
  categories: NamedRow[];
  vendors: NamedRow[];
  countries: string[];
}> {
  const [
    { data: businesses },
    { data: categories },
    { data: vendors },
    { data: countryRows },
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name")
      .eq("is_archived", false)
      .order("sort", { ascending: true }),
    supabase.from("categories").select("id, name").order("name"),
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .limit(MAX_VENDOR_OPTIONS),
    supabase
      .from("expenses")
      .select("country")
      .eq("record_type", recordType)
      .limit(COUNTRY_SCAN_LIMIT),
  ]);
  const countries = [
    ...new Set(
      (countryRows ?? [])
        .map((r) => (r.country ?? "").trim().toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  return {
    businesses: businesses ?? [],
    categories: categories ?? [],
    vendors: vendors ?? [],
    countries,
  };
}

/**
 * Shared table for the Purchase Orders and Expenses tabs. Both render the
 * same columns, filtered by `record_type` and (optionally) by business.
 * `businessFilter` is the raw `?business=` param: a business id, "unassigned",
 * or empty for all. `pageParam` is the raw `?page=` param — validated here, not
 * trusted. `filters` is already parsed + validated by `parseRecordFilters`.
 */
export async function RecordsList({
  recordType,
  canManage = false,
  businessFilter = "",
  pageParam,
  filters = EMPTY_RECORD_FILTERS,
}: {
  recordType: RecordType;
  canManage?: boolean;
  businessFilter?: string;
  pageParam?: string | string[];
  filters?: RecordFilters;
}) {
  const supabase = await createClient();

  const page = parsePageParam(pageParam);
  const from = (page - 1) * RECORDS_PAGE_SIZE;
  const to = from + RECORDS_PAGE_SIZE - 1;

  // Free-text search also matches vendor names, which live in another table —
  // resolve the matching vendor ids first, then fold them into the main query.
  // The ids come straight from the DB, so they are safe to list in a filter.
  let textVendorIds: string[] = [];
  if (filters.q) {
    const { data: vs } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", `%${filters.q}%`)
      .limit(MAX_VENDOR_MATCHES);
    textVendorIds = (vs ?? []).map((v) => v.id);
  }

  let query = supabase
    .from("expenses")
    .select(
      "id, invoice_number, invoice_date, total, currency, status, vendor_id, category_id, business_id",
      { count: "exact" },
    )
    .eq("record_type", recordType)
    // `created_at` is the tiebreaker so rows can't shuffle between pages when
    // several share an invoice date (or have none).
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (businessFilter === "unassigned") query = query.is("business_id", null);
  else if (isUuid(businessFilter))
    query = query.eq("business_id", businessFilter);

  // Validated filters — each value is passed to the builder as a value, not
  // spliced into SQL. `.or(...)` is the only filter-grammar string, and its
  // text value is quoted + escaped by `buildTextSearchOr` / `likeValue`.
  if (filters.from) query = query.gte("invoice_date", filters.from);
  if (filters.to) query = query.lte("invoice_date", filters.to);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.vendorId) query = query.eq("vendor_id", filters.vendorId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.q) query = query.or(buildTextSearchOr(filters.q, textVendorIds));

  const { data: rows, count } = await query;

  const total = count ?? 0;
  const pageCount = pageCountFor(total);

  if (!rows || rows.length === 0) {
    // Page 1 empty = genuinely nothing here. A higher page landing empty means
    // the data shrank under the visitor's feet — show a way back, not "no data".
    if (page > 1) {
      return (
        <>
          <Card className="p-6 text-center text-sm text-zinc-500">
            Nothing on page {page} — the list may have got shorter. Step back
            with Prev.
          </Card>
          <ListPager page={page} pageCount={pageCount} total={total} />
        </>
      );
    }
    if (hasActiveRecordFilters(filters)) {
      return (
        <Card className="p-6 text-center text-sm text-zinc-500">
          No {recordType === "invoice" ? "purchase orders" : "expenses"} match
          these filters.{" "}
          <a
            href={
              businessFilter
                ? `?business=${encodeURIComponent(businessFilter)}`
                : "?"
            }
            className="font-medium text-blue-600 hover:underline"
          >
            Clear filters
          </a>
          .
        </Card>
      );
    }
    return (
      <EmptyState icon={recordType === "invoice" ? "invoice" : "expense"}>
        No {recordType === "invoice" ? "purchase orders" : "expenses"} here yet.
      </EmptyState>
    );
  }

  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))];
  const categoryIds = [
    ...new Set(rows.map((r) => r.category_id).filter(Boolean)),
  ];

  const [{ data: vendors }, { data: categories }, { data: businesses }] =
    await Promise.all([
      vendorIds.length
        ? supabase
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      categoryIds.length
        ? supabase
            .from("categories")
            .select("id, name")
            .in("id", categoryIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase.from("businesses").select("id, name"),
    ]);

  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const businessName = new Map((businesses ?? []).map((b) => [b.id, b.name]));

  const table = (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Number</th>
              <th className="px-4 py-2.5 font-medium">Business</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => {
              const href = `/records/${r.id}`;
              const cell =
                "px-4 py-2.5 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40";
              return (
                <tr key={r.id} className="group">
                  <td className={`${cell} tabular-nums text-zinc-500`}>
                    <Link href={href} className="block">
                      {r.invoice_date ?? "—"}
                    </Link>
                  </td>
                  <td className={`${cell} font-medium`}>
                    <Link href={href} className="block">
                      {r.vendor_id
                        ? (vendorName.get(r.vendor_id) ?? "—")
                        : "—"}
                    </Link>
                  </td>
                  <td className={cell}>
                    <Link href={href} className="block">
                      {r.invoice_number ?? "—"}
                    </Link>
                  </td>
                  <td className={cell}>
                    <Link href={href} className="block">
                      {r.business_id ? (
                        <Badge>{businessName.get(r.business_id) ?? "—"}</Badge>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </Link>
                  </td>
                  <td className={`${cell} text-zinc-500`}>
                    <Link href={href} className="block">
                      {r.category_id
                        ? (categoryName.get(r.category_id) ?? "—")
                        : "—"}
                    </Link>
                  </td>
                  <td className={`${cell} text-right font-medium tabular-nums`}>
                    <Link href={href} className="block">
                      {r.total != null
                        ? `${r.currency} ${Number(r.total).toLocaleString("en-IN")}`
                        : "—"}
                    </Link>
                  </td>
                  <td className={cell}>
                    <Link href={href} className="block">
                      <Badge tone="status">{r.status}</Badge>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40">
                    {canManage && r.status !== "exported" ? (
                      <DeleteRecordButton
                        recordId={r.id}
                        srLabel={r.invoice_number ?? "record"}
                      />
                    ) : (
                      <Link href={href} className="block text-zinc-300">
                        <Icon name="chevronRight" className="size-4" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <>
      {table}
      <ListPager page={page} pageCount={pageCount} total={total} />
    </>
  );
}
