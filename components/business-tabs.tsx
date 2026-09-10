"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Segmented filter: All / <each business> / Unassigned.
 * State lives in the `?business=` query param (a business id, the literal
 * "unassigned", or absent = all).
 */
export function BusinessTabs({
  businesses,
}: {
  businesses: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("business") ?? "";

  const href = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("business", value);
    else next.delete("business");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const items = [
    { value: "", label: "All" },
    ...businesses.map((b) => ({ value: b.id, label: b.name })),
    { value: "unassigned", label: "Unassigned" },
  ];

  return (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
      {items.map((it) => {
        const active = current === it.value;
        return (
          <Link
            key={it.value || "all"}
            href={href(it.value)}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition active:scale-[.97] ${
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
