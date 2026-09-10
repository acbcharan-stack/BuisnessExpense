import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { BusinessTabs } from "@/components/business-tabs";
import { RecordsFilters } from "@/components/records-filters";
import { APP_NAME } from "@/lib/constants";
import { parseRecordFilters } from "@/lib/records-filter";
import { RecordsList, loadRecordListChrome } from "../records-list";

export const metadata: Metadata = {
  title: `Purchase Orders · ${APP_NAME}`,
};
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const [sp, , { businesses, categories, vendors, countries }] =
    await Promise.all([
      searchParams,
      requireProfile(),
      loadRecordListChrome(supabase, "invoice"),
    ]);
  // Every signed-in user has full access (roles were flattened in 0004).
  const canManage = true;

  const business = typeof sp.business === "string" ? sp.business : "";
  const page = typeof sp.page === "string" ? sp.page : undefined;
  const filters = parseRecordFilters(sp);

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
      {businesses.length > 0 && <BusinessTabs businesses={businesses} />}
      <RecordsFilters
        filters={filters}
        businessFilter={business}
        categories={categories}
        vendors={vendors}
        countries={countries}
      />
      <RecordsList
        recordType="invoice"
        canManage={canManage}
        businessFilter={business}
        pageParam={page}
        filters={filters}
      />
    </>
  );
}
