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

export const metadata: Metadata = { title: `Expenses · ${APP_NAME}` };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const [sp, , { businesses, categories, vendors, countries }] =
    await Promise.all([
      searchParams,
      requireProfile(),
      loadRecordListChrome(supabase, "expense"),
    ]);
  // Every signed-in user has full access (roles were flattened in 0004).
  const canManage = true;

  const business = typeof sp.business === "string" ? sp.business : "";
  const page = typeof sp.page === "string" ? sp.page : undefined;
  const filters = parseRecordFilters(sp);

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
      {businesses.length > 0 && <BusinessTabs businesses={businesses} />}
      <RecordsFilters
        filters={filters}
        businessFilter={business}
        categories={categories}
        vendors={vendors}
        countries={countries}
      />
      <RecordsList
        recordType="expense"
        canManage={canManage}
        businessFilter={business}
        pageParam={page}
        filters={filters}
      />
    </>
  );
}
