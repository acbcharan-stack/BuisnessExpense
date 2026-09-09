import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { RecordsList } from "../records-list";

export const metadata: Metadata = { title: "Expenses · Invoice Scanner" };

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="Business expenses"
        description="Electricity, wages, rent, freight and other running costs."
      />
      <RecordsList recordType="expense" />
    </>
  );
}
