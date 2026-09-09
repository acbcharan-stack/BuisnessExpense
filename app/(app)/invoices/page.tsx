import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { RecordsList } from "../records-list";

export const metadata: Metadata = { title: "Invoices · Invoice Scanner" };

export default function InvoicesPage() {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Supplier invoices and bills for goods & services (GST / ITC relevant)."
      />
      <RecordsList recordType="invoice" />
    </>
  );
}
