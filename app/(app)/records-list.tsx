import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/page-header";
import type { RecordType } from "@/lib/types";

/**
 * Shared table for the Invoices and Expenses tabs. Both render the same
 * columns, filtered by `record_type`. Vendor/category names are resolved
 * with lookup maps (generated Supabase types + embedded joins come in Phase 1).
 */
export async function RecordsList({ recordType }: { recordType: RecordType }) {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("expenses")
    .select(
      "id, invoice_number, invoice_date, total, currency, status, vendor_id, category_id",
    )
    .eq("record_type", recordType)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .limit(100);

  if (!rows || rows.length === 0) {
    return (
      <EmptyState>
        No {recordType === "invoice" ? "invoices" : "expenses"} yet. Capture and
        review flow lands in Phase&nbsp;1.
      </EmptyState>
    );
  }

  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))];
  const categoryIds = [
    ...new Set(rows.map((r) => r.category_id).filter(Boolean)),
  ];

  const [{ data: vendors }, { data: categories }] = await Promise.all([
    vendorIds.length
      ? supabase.from("vendors").select("id, name").in("id", vendorIds as string[])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    categoryIds.length
      ? supabase
          .from("categories")
          .select("id, name")
          .in("id", categoryIds as string[])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Vendor</th>
            <th className="px-4 py-2">Number</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 tabular-nums">{r.invoice_date ?? "—"}</td>
              <td className="px-4 py-2">
                {r.vendor_id ? (vendorName.get(r.vendor_id) ?? "—") : "—"}
              </td>
              <td className="px-4 py-2">{r.invoice_number ?? "—"}</td>
              <td className="px-4 py-2">
                {r.category_id ? (categoryName.get(r.category_id) ?? "—") : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.total != null
                  ? `${r.currency} ${Number(r.total).toLocaleString("en-IN")}`
                  : "—"}
              </td>
              <td className="px-4 py-2 text-xs text-zinc-500">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
