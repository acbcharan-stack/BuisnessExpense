import type { Metadata } from "next";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { RecordsList } from "../records-list";

export const metadata: Metadata = { title: "Expenses · Invoice Scanner" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const profile = await requireProfile();
  const canManage = profile.role === "owner" || profile.role === "accountant";

  return (
    <>
      <PageHeader
        title="Business expenses"
        description="Electricity, wages, rent, freight and other running costs."
        action={
          canManage ? <ExportButton type="expense" label="Export expenses" /> : null
        }
      />
      <RecordsList recordType="expense" />
    </>
  );
}
