"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Prev / next navigation for the record tables. The current page lives in the
 * `?page=` query param; every other active filter already in the URL (business,
 * status, search, ...) is carried across unchanged so paging never drops a
 * filter.
 */
export function ListPager({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (target: number) => {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  const base =
    "inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-medium transition active:scale-[.97]";
  const on =
    "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
  const off =
    "pointer-events-none border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
      <span className="tabular-nums">
        Page {page} of {pageCount} · {total.toLocaleString("en-IN")} record
        {total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-1.5">
        {hasPrev ? (
          <Link
            href={href(page - 1)}
            rel="prev"
            prefetch
            className={`${base} ${on}`}
          >
            ← Prev
          </Link>
        ) : (
          <span aria-disabled className={`${base} ${off}`}>
            ← Prev
          </span>
        )}
        {hasNext ? (
          <Link
            href={href(page + 1)}
            rel="next"
            prefetch
            className={`${base} ${on}`}
          >
            Next →
          </Link>
        ) : (
          <span aria-disabled className={`${base} ${off}`}>
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
