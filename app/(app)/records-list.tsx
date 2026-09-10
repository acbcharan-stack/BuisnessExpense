import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/page-header";
import { Badge, Card, Icon } from "@/components/ui";
import type { RecordType } from "@/lib/types";

/**
 * Shared table for the Invoices and Expenses tabs. Both render the same
 * columns, filtered by `record_type`.
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
      <EmptyState icon={recordType === "invoice" ? "invoice" : "expense"}>
        No {recordType === "invoice" ? "invoices" : "expenses"} yet. Capture one
        from the Inbox and it lands here after review.
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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Number</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => {
              const href = `/records/${r.id}`;
              const cell =
                "px-4 py-2.5 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40";
              return (
                <tr key={r.id} className="group cursor-pointer">
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
                  <td className={`${cell} text-zinc-300`}>
                    <Link href={href} className="block">
                      <Icon name="chevronRight" className="size-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
