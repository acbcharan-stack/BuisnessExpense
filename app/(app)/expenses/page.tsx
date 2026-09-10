import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { BusinessTabs } from "@/components/business-tabs";
import { APP_NAME } from "@/lib/constants";
import { RecordsList } from "../records-list";

export const metadata: Metadata = { title: `Expenses · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  const [{ business }, profile, supabase] = await Promise.all([
    searchParams,
    requireProfile(),
    createClient(),
  ]);
  const canManage = profile.role === "owner" || profile.role === "accountant";
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("is_archived", false)
    .order("sort", { ascending: true });

  return (
    <>
      <PageHeader
        title="Business expenses"
        description="Electricity, wages, rent, freight and other running costs."
        action={
          canManage ? (
            <ExportButton type="expense" label="Export expenses" />
          ) : null
        }
      />
      {(businesses?.length ?? 0) > 0 && (
        <BusinessTabs businesses={businesses ?? []} />
      )}
      <RecordsList
        recordType="expense"
        canManage={canManage}
        businessFilter={business ?? ""}
      />
    </>
  );
}
