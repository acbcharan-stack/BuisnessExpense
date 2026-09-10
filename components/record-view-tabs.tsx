"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Segmented filter for the dashboard: All / Purchase Orders / Expenses.
 * State lives in the `?view=` query param (`invoice`, `expense`, or absent =
 * all). Every other param already in the URL (e.g. `business`) is kept.
 */
export function RecordViewTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("view") ?? "";

  const href = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("view", value);
    else next.delete("view");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const items = [
    { value: "", label: "All" },
    { value: "invoice", label: "Purchase orders" },
    { value: "expense", label: "Expenses" },
  ];

  return (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
      {items.map((it) => {
        const active = current === it.value;
        return (
          <Link
            key={it.value || "all"}
            href={href(it.value)}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition active:scale-[.97] ${
              active
                ? "bg-blue-600 text-white dark:bg-blue-500"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
