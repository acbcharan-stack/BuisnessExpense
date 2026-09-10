import type { Metadata } from "next";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { RecordsList } from "../records-list";

export const metadata: Metadata = { title: "Invoices · Invoice Scanner" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const profile = await requireProfile();
  const canManage = profile.role === "owner" || profile.role === "accountant";

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Supplier invoices and bills for goods & services (GST / ITC relevant)."
        action={
          canManage ? <ExportButton type="invoice" label="Export invoices" /> : null
        }
      />
      <RecordsList recordType="invoice" />
    </>
  );
}
