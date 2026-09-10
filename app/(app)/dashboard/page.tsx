import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { financialYearOf } from "@/lib/tax/fy";

export const metadata: Metadata = { title: "Dashboard · Invoice Scanner" };
export const dynamic = "force-dynamic";

const MONTH = (d: Date) =>
  d.toLocaleDateString("en-IN", { month: "short" });
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const inr = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const fy = financialYearOf(now);

  // Four fiscal quarters of the current Indian FY (Q1 = Apr–Jun … Q4 = Jan–Mar).
  const quarters = [0, 1, 2, 3].map((i) => {
    const start = new Date(fy.startYear, 3 + i * 3, 1);
    const end = new Date(fy.startYear, 3 + (i + 1) * 3, 1);
    return {
      key: `Q${i + 1}`,
      span: `${MONTH(start)}–${MONTH(new Date(end.getTime() - 86400000))}`,
      start,
      end,
      total: 0,
      current: now >= start && now < end,
    };
  });

  const [{ count: pendingReview }, { count: totalRecords }, { data: rows }] =
    await Promise.all([
      supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("status", "review"),
      supabase.from("expenses").select("id", { count: "exact", head: true }),
      supabase
        .from("expenses")
        .select("invoice_date, amount_inr, total, currency")
        .in("status", ["confirmed", "exported"])
        .gte("invoice_date", isoDate(fy.start))
        .lt("invoice_date", isoDate(fy.end)),
    ]);

  for (const r of rows ?? []) {
    if (!r.invoice_date) continue;
    const amt =
      r.amount_inr ?? (r.currency === "INR" ? r.total : null);
    if (amt == null) continue;
    const d = new Date(`${r.invoice_date}T00:00:00`);
    const q = quarters.find((q) => d >= q.start && d < q.end);
    if (q) q.total += Number(amt);
  }

  const fyTotal = quarters.reduce((s, q) => s + q.total, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Spend overview and what needs your attention."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Awaiting review" value={pendingReview ?? 0} />
        <Stat label="Records captured" value={totalRecords ?? 0} />
      </div>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            Spend by quarter{" "}
            <span className="font-normal text-zinc-400">· FY {fy.label}</span>
          </h2>
          <span className="text-sm tabular-nums text-zinc-500">
            {inr(fyTotal)} total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {quarters.map((q) => (
            <div
              key={q.key}
              className={`rounded-xl border p-4 ${
                q.current
                  ? "border-zinc-900 bg-white dark:border-white dark:bg-zinc-900"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {q.key}
                {q.current ? " · now" : ""}
              </p>
              <p className="text-[11px] text-zinc-400">{q.span}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {inr(q.total)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Confirmed &amp; exported records only, by invoice date. Foreign-currency
          records without an INR value are excluded.
        </p>
      </section>

      <div className="mt-6">
        <EmptyState>
          Trend, category split and top-vendor charts arrive in Phase&nbsp;3.
        </EmptyState>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
