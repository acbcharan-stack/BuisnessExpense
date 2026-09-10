import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { ReviewForm, type ReviewFormData } from "../[id]/review-form";

export const metadata: Metadata = { title: "New record · Invoice Scanner" };
export const dynamic = "force-dynamic";

export default async function NewRecordPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: categories }, { data: vendors }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, default_record_type")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
    supabase.from("vendors").select("id, name").order("name").limit(500),
  ]);

  const data: ReviewFormData = {
    expenseId: "",
    status: "",
    canManage: profile.role === "owner" || profile.role === "accountant",
    manual: true,
    mode: "create",
    document: { mimeType: null, filename: null, signedUrl: null },
    categories: categories ?? [],
    vendors: vendors ?? [],
    confidence: null,
    initial: {
      record_type: "expense",
      vendor_name: "",
      category_id: "",
      new_category_name: "",
      invoice_number: "",
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      currency: "INR",
      country: "IN",
      subtotal: "",
      tax_total: "",
      total: "",
      notes: "",
      line_items: [],
      taxes: [],
      custom_fields: [],
    },
  };

  return (
    <>
      <PageHeader
        title="New record"
        description="Enter a receipt or bill by hand — no photo, no AI. It goes straight to the review queue."
      />
      <ReviewForm data={data} />
    </>
  );
}
