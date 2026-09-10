import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { BusinessTabs } from "@/components/business-tabs";
import { APP_NAME } from "@/lib/constants";
import { RecordsList } from "../records-list";

export const metadata: Metadata = {
  title: `Purchase Orders · ${APP_NAME}`,
};
export const dynamic = "force-dynamic";

export default async function InvoicesPage({
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
        title="Purchase Orders"
        description="Supplier invoices and bills for goods & services (GST / ITC relevant)."
        action={
          canManage ? (
            <ExportButton
              type="invoice"
              recordId={undefined}
              label="Export purchase orders"
            />
          ) : null
        }
      />
      {(businesses?.length ?? 0) > 0 && (
        <BusinessTabs businesses={businesses ?? []} />
      )}
      <RecordsList
        recordType="invoice"
        canManage={canManage}
        businessFilter={business ?? ""}
      />
    </>
  );
}
