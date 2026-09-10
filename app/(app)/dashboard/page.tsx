import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, Icon } from "@/components/ui";
import { BusinessTabs } from "@/components/business-tabs";
import { RecordViewTabs } from "@/components/record-view-tabs";
import { APP_NAME } from "@/lib/constants";
import { isUuid } from "@/lib/uuid";
import { financialYearOf } from "@/lib/tax/fy";
import { ITC_TAX_TYPES } from "@/lib/tax/gst";

export const metadata: Metadata = { title: `Dashboard · ${APP_NAME}` };
export const dynamic = "force-dynamic";

const MONTH = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; view?: string }>;
}) {
  const { business = "", view = "" } = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const fy = financialYearOf(now);

  // `?view=` narrows the spend / ITC roll-ups to one record type. Anything not
  // in the known set is treated as "all".
  const recordView: "invoice" | "expense" | null =
    view === "invoice" || view === "expense" ? view : null;

  // Apply the ?business= filter to any expenses query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byBiz = <T extends { eq: any; is: any }>(q: T): T => {
    if (business === "unassigned") return q.is("business_id", null);
    if (isUuid(business)) return q.eq("business_id", business);
    return q;
  };

  // Apply the ?view= record-type filter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byView = <T extends { eq: any }>(q: T): T =>
    recordView ? q.eq("record_type", recordView) : q;

  const quarters = [0, 1, 2, 3].map((i) => {
    const start = new Date(fy.startYear, 3 + i * 3, 1);
    const end = new Date(fy.startYear, 3 + (i + 1) * 3, 1);
    return {
      key: `Q${i + 1}`,
      span: `${MONTH(start)}–${MONTH(new Date(end.getTime() - 86400000))}`,
      start,
      end,
      total: 0,
      /** GST input tax credit (CGST+SGST+IGST+CESS) on domestic records. */
      itc: 0,
      current: now >= start && now < end,
    };
  });

  const [
    { count: pendingReview },
    { count: totalRecords },
    { count: invoiceCount },
    { count: expenseCount },
    { data: rows },
    { data: valueRows },
    { data: businesses },
  ] = await Promise.all([
    byView(
      byBiz(
        supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("status", "review"),
      ),
    ),
    byView(
      byBiz(supabase.from("expenses").select("id", { count: "exact", head: true })),
    ),
    byBiz(
      supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("record_type", "invoice"),
    ),
    byBiz(
      supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("record_type", "expense"),
    ),
    byView(
      byBiz(
        supabase
          .from("expenses")
          .select("id, invoice_date, amount_inr, total, currency, country")
          .in("status", ["confirmed", "exported"])
          .gte("invoice_date", isoDate(fy.start))
          .lt("invoice_date", isoDate(fy.end)),
      ),
    ),
    byBiz(
      supabase
        .from("expenses")
        .select("record_type, amount_inr, total, currency")
        .in("status", ["confirmed", "exported"]),
    ),
    supabase
      .from("businesses")
      .select("id, name")
      .eq("is_archived", false)
      .order("sort", { ascending: true }),
  ]);

  // Which quarter each in-FY confirmed record falls in — reused for the ITC
  // roll-up below so we only date-bucket once.
  const quarterOfExpense = new Map<string, (typeof quarters)[number]>();
  for (const r of rows ?? []) {
    if (!r.invoice_date) continue;
    const d = new Date(`${r.invoice_date}T00:00:00`);
    const q = quarters.find((q) => d >= q.start && d < q.end);
    if (!q) continue;
    quarterOfExpense.set(r.id, q);
    const amt = r.amount_inr ?? (r.currency === "INR" ? r.total : null);
    if (amt != null) q.total += Number(amt);
  }
  const fyTotal = quarters.reduce((s, q) => s + q.total, 0);
  const qMax = Math.max(1, ...quarters.map((q) => q.total));

  // GST input tax credit: sum CGST/SGST/IGST/CESS on this FY's confirmed
  // *domestic* records, bucketed by quarter. Foreign invoices carry VAT / sales
  // tax, which is not creditable here, so they are excluded by country.
  const domesticIds = (rows ?? [])
    .filter((r) => (r.country ?? "IN").toUpperCase() === "IN")
    .map((r) => r.id)
    .filter((id) => quarterOfExpense.has(id));
  for (let i = 0; i < domesticIds.length; i += 200) {
    const { data: taxRows } = await supabase
      .from("expense_taxes")
      .select("expense_id, tax_type, amount")
      .in("expense_id", domesticIds.slice(i, i + 200))
      .in("tax_type", [...ITC_TAX_TYPES]);
    for (const t of taxRows ?? []) {
      const q = quarterOfExpense.get(t.expense_id);
      const amt = Number(t.amount);
      if (q && Number.isFinite(amt)) q.itc += amt;
    }
  }
  const fyItc = quarters.reduce((s, q) => s + q.itc, 0);
  const itcMax = Math.max(1, ...quarters.map((q) => q.itc));

  let poValue = 0;
  let expValue = 0;
  for (const r of valueRows ?? []) {
    const amt = r.amount_inr ?? (r.currency === "INR" ? r.total : null);
    if (amt == null) continue;
    if (r.record_type === "invoice") poValue += Number(amt);
    else expValue += Number(amt);
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Spend overview and what needs your attention."
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-0">
        {(businesses?.length ?? 0) > 0 && (
          <BusinessTabs businesses={businesses ?? []} />
        )}
        <RecordViewTabs />
      </div>

      {(pendingReview ?? 0) > 0 && (
        <Link
          href="/inbox"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100 active:scale-[.99] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="flex items-center gap-2">
            <Icon name="alert" className="size-4" />
            <strong>{pendingReview}</strong> record
            {pendingReview === 1 ? "" : "s"} waiting for review
          </span>
          <span className="flex items-center gap-1 font-medium">
            Go to Inbox <Icon name="chevronRight" className="size-4" />
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="clock" label="Awaiting review" value={pendingReview ?? 0} />
        <Stat icon="file" label="Records captured" value={totalRecords ?? 0} />
        <Stat
          icon="invoice"
          label="Purchase orders"
          value={invoiceCount ?? 0}
          sub={`${inr(poValue)} confirmed`}
        />
        <Stat
          icon="expense"
          label="Expenses"
          value={expenseCount ?? 0}
          sub={`${inr(expValue)} confirmed`}
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            Spend by quarter{" "}
            <span className="font-normal text-zinc-400">· FY {fy.label}</span>
          </h2>
          <span className="text-sm font-medium tabular-nums text-zinc-500">
            {inr(fyTotal)} total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {quarters.map((q) => (
            <Card
              key={q.key}
              className={`p-4 ${q.current ? "ring-2 ring-blue-500/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {q.key}
                </p>
                {q.current && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    <span className="size-1.5 rounded-full bg-blue-500" />
                    now
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">{q.span}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {inr(q.total)}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.round((q.total / qMax) * 100)}%` }}
                />
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Confirmed &amp; exported records only, by invoice date. Foreign-currency
          records without an INR value are excluded.
        </p>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            GST input tax credit{" "}
            <span className="font-normal text-zinc-400">· FY {fy.label}</span>
          </h2>
          <span className="text-sm font-medium tabular-nums text-zinc-500">
            {inr(fyItc)} total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {quarters.map((q) => (
            <Card
              key={q.key}
              className={`p-4 ${q.current ? "ring-2 ring-blue-500/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {q.key}
                </p>
                <p className="text-[11px] text-zinc-400">{q.span}</p>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {inr(q.itc)}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round((q.itc / itcMax) * 100)}%` }}
                />
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          CGST + SGST + IGST + CESS on confirmed &amp; exported domestic records,
          by invoice date. This is the credit you can claim against output GST.
        </p>
      </section>

      <section className="mt-8">
        <Card className="flex items-center gap-3 p-4 text-sm text-zinc-500">
          <Icon name="dashboard" className="size-5 shrink-0 text-zinc-400" />
          Trend, category split and top-vendor charts arrive in Phase&nbsp;3.
        </Card>
      </section>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon name={icon} className="size-4" />
        <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? (
        <p className="mt-0.5 text-xs tabular-nums text-zinc-400">{sub}</p>
      ) : null}
    </Card>
  );
}
