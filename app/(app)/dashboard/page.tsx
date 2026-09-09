import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard · Invoice Scanner" };

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: pendingReview }, { count: totalRecords }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),
    supabase.from("expenses").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Spend overview and what needs your attention."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Awaiting review" value={pendingReview ?? 0} />
        <Stat label="Records captured" value={totalRecords ?? 0} />
        <Stat label="This FY spend (₹)" value="—" />
      </div>
      <div className="mt-6">
        <EmptyState>
          Charts (monthly trend, category split, top vendors) arrive in Phase&nbsp;3.
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
