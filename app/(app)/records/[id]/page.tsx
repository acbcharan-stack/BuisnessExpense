import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { createSignedDocumentUrl } from "@/lib/supabase/storage";
import { GENERATED_INVOICE_BUCKET } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { Button } from "@/components/ui";
import { APP_NAME } from "@/lib/constants";
import { ReviewForm, type ReviewFormData } from "./review-form";

export const metadata: Metadata = { title: `Review · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function RecordReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
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
    { data: businesses },
    { data: vendors },
    { data: job },
    { data: generatedInvoice },
  ] = await Promise.all([
    expense.document_id
      ? supabase
          .from("documents")
          .select("id, storage_path, original_filename, mime_type")
          .eq("id", expense.document_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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
    supabase
      .from("businesses")
      .select("id, name")
      .eq("is_archived", false)
      .order("sort", { ascending: true }),
    supabase.from("vendors").select("id, name").order("name").limit(500),
    expense.document_id
      ? supabase
          .from("extraction_jobs")
          .select("raw_response")
          .eq("document_id", expense.document_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    expense.record_type === "invoice"
      ? supabase
          .from("generated_invoices")
          .select("id, status, direction, our_invoice_number, pdf_storage_path")
          .eq("source_expense_id", id)
          .neq("status", "void")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const generatedInvoicePdfUrl =
    generatedInvoice?.status === "confirmed" && generatedInvoice.pdf_storage_path
      ? await createSignedDocumentUrl(
          supabase,
          generatedInvoice.pdf_storage_path,
          3600,
          false,
          GENERATED_INVOICE_BUCKET,
        )
      : null;

  const [signedUrl, downloadUrl] = document?.storage_path
    ? await Promise.all([
        createSignedDocumentUrl(supabase, document.storage_path),
        createSignedDocumentUrl(
          supabase,
          document.storage_path,
          3600,
          document.original_filename ?? true,
        ),
      ])
    : [null, null];

  const currentVendor = expense.vendor_id
    ? ((vendors ?? []).find((v) => v.id === expense.vendor_id) ?? null)
    : null;

  const raw = (job?.raw_response ?? null) as Record<string, unknown> | null;
  const confidence =
    raw && typeof raw.confidence === "number" ? raw.confidence : null;

  const data: ReviewFormData = {
    expenseId: expense.id,
    status: expense.status,
    canManage: true,
    manual: !expense.document_id,
    document: {
      mimeType: document?.mime_type ?? null,
      filename: document?.original_filename ?? null,
      signedUrl,
      downloadUrl,
    },
    categories: categories ?? [],
    businesses: businesses ?? [],
    vendors: vendors ?? [],
    confidence,
    initial: {
      record_type: expense.record_type,
      business_id: expense.business_id ?? "",
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
      custom_fields: (expense.custom_fields ?? []).map((f) => ({
        label: f.label ?? "",
        value: f.value ?? "",
      })),
    },
  };

  return (
    <>
      <PageHeader
        title="Review record"
        description={
          expense.status === "review"
            ? "Check the details, fix anything wrong, then confirm."
            : `This record is ${expense.status}.`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {expense.record_type === "invoice" && (
              <Link href={`/records/${expense.id}/convert`}>
                <Button variant="secondary" size="sm" icon="invoice">
                  {generatedInvoice ? "Edit generated invoice" : "Convert to Invoice"}
                </Button>
              </Link>
            )}
            <ExportButton
              type="all"
              recordId={expense.id}
              label="Export this record"
            />
            {data.canManage && expense.status !== "exported" && (
              <DeleteRecordButton
                recordId={expense.id}
                label="Delete"
                srLabel={expense.invoice_number ?? "this record"}
                redirectTo={
                  expense.record_type === "invoice" ? "/invoices" : "/expenses"
                }
              />
            )}
          </div>
        }
      />
      {generatedInvoice?.status === "confirmed" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <span className="font-medium text-emerald-800 dark:text-emerald-300">
            Generated invoice: {generatedInvoice.our_invoice_number}
          </span>
          <span className="text-emerald-700/80 dark:text-emerald-400/80">
            ({generatedInvoice.direction === "purchase" ? "Purchase / Self-Invoice" : "Sale Invoice"})
          </span>
          {generatedInvoicePdfUrl && (
            <a
              href={generatedInvoicePdfUrl}
              download
              className="ml-auto font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Download PDF
            </a>
          )}
        </div>
      )}
      <ReviewForm data={data} />
    </>
  );
}
