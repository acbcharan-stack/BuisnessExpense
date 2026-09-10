import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { APP_NAME } from "@/lib/constants";
import { ReviewForm, type ReviewFormData } from "../[id]/review-form";

export const metadata: Metadata = { title: `New record · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function NewRecordPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: categories }, { data: businesses }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, default_record_type")
        .eq("is_archived", false)
        .order("name", { ascending: true }),
      supabase
        .from("businesses")
        .select("id, name")
        .eq("is_archived", false)
        .order("sort", { ascending: true }),
      supabase.from("vendors").select("id, name").order("name").limit(500),
    ]);

  const data: ReviewFormData = {
    expenseId: "",
    status: "",
    canManage: true,
    manual: true,
    mode: "create",
    document: {
      mimeType: null,
      filename: null,
      signedUrl: null,
      downloadUrl: null,
    },
    categories: categories ?? [],
    businesses: businesses ?? [],
    vendors: vendors ?? [],
    confidence: null,
    initial: {
      record_type: "expense",
      business_id: "",
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
