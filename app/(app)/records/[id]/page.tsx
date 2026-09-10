import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { createSignedDocumentUrl } from "@/lib/supabase/storage";
import { PageHeader } from "@/components/page-header";
import { ReviewForm, type ReviewFormData } from "./review-form";

export const metadata: Metadata = { title: "Review · Invoice Scanner" };
export const dynamic = "force-dynamic";

export default async function RecordReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: expense } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!expense) notFound();

  const [
    { data: document },
    { data: lineItems },
    { data: taxes },
    { data: categories },
    { data: vendors },
    { data: job },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id, storage_path, original_filename, mime_type")
      .eq("id", expense.document_id)
      .maybeSingle(),
    supabase
      .from("expense_line_items")
      .select("*")
      .eq("expense_id", id)
      .order("line_no", { ascending: true, nullsFirst: false }),
    supabase.from("expense_taxes").select("*").eq("expense_id", id),
    supabase
      .from("categories")
      .select("id, name, default_record_type")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
    supabase.from("vendors").select("id, name").order("name").limit(500),
    supabase
      .from("extraction_jobs")
      .select("raw_response, status, gemini_model")
      .eq("document_id", expense.document_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const signedUrl = document?.storage_path
    ? await createSignedDocumentUrl(supabase, document.storage_path)
    : null;

  const currentVendor = expense.vendor_id
    ? ((vendors ?? []).find((v) => v.id === expense.vendor_id) ?? null)
    : null;

  const raw = (job?.raw_response ?? null) as Record<string, unknown> | null;
  const confidence =
    raw && typeof raw.confidence === "number" ? raw.confidence : null;

  const data: ReviewFormData = {
    expenseId: expense.id,
    status: expense.status,
    canManage: profile.role === "owner" || profile.role === "accountant",
    document: {
      mimeType: document?.mime_type ?? null,
      filename: document?.original_filename ?? null,
      signedUrl,
    },
    categories: categories ?? [],
    vendors: vendors ?? [],
    confidence,
    initial: {
      record_type: expense.record_type,
      vendor_name: currentVendor?.name ?? "",
      category_id: expense.category_id ?? "",
      new_category_name: "",
      invoice_number: expense.invoice_number ?? "",
      invoice_date: expense.invoice_date ?? "",
      due_date: expense.due_date ?? "",
      currency: expense.currency ?? "INR",
      country: expense.country ?? "IN",
      subtotal: expense.subtotal ?? "",
      tax_total: expense.tax_total ?? "",
      total: expense.total ?? "",
      notes: expense.notes ?? "",
      line_items: (lineItems ?? []).map((li) => ({
        description: li.description ?? "",
        hsn_sac: li.hsn_sac ?? "",
        quantity: li.quantity ?? "",
        unit_price: li.unit_price ?? "",
        amount: li.amount ?? "",
        tax_rate: li.tax_rate ?? "",
      })),
      taxes: (taxes ?? []).map((t) => ({
        tax_type: t.tax_type,
        rate: t.rate ?? "",
        amount: t.amount ?? "",
        jurisdiction: t.jurisdiction ?? "",
      })),
    },
  };

  return (
    <>
      <PageHeader
        title="Review record"
        description={
          expense.status === "review"
            ? "Check what Gemini extracted, fix anything wrong, then confirm."
            : `This record is ${expense.status}. Editing is disabled.`
        }
      />
      <ReviewForm data={data} />
    </>
  );
}
