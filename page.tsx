import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { createSignedDocumentUrl } from "@/lib/supabase/storage";
import { APP_NAME, ASSET_BUCKET, GENERATED_INVOICE_BUCKET } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import type { TaxType } from "@/lib/types";
import { ConvertForm, type ConvertFormData } from "./convert-form";

export const metadata: Metadata = { title: `Convert to Invoice · ${APP_NAME}` };
export const dynamic = "force-dynamic";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default async function ConvertToInvoicePage({
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
  if (!expense || expense.record_type !== "invoice") notFound();

  const [
    { data: lineItems },
    { data: taxes },
    { data: vendor },
    { data: businesses },
    { data: existing },
  ] = await Promise.all([
    supabase
      .from("expense_line_items")
      .select("*")
      .eq("expense_id", id)
      .order("line_no", { ascending: true, nullsFirst: false }),
    supabase.from("expense_taxes").select("*").eq("expense_id", id),
    expense.vendor_id
      ? supabase
          .from("vendors")
          .select("id, name, tax_id, tax_id_type, country")
          .eq("id", expense.vendor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("businesses")
      .select("*")
      .eq("is_archived", false)
      .order("sort", { ascending: true }),
    supabase
      .from("generated_invoices")
      .select("*")
      .eq("source_expense_id", id)
      .neq("status", "void")
      .maybeSingle(),
  ]);

  let existingLineItems: { description: string | null; hsn_sac: string | null; quantity: number | null; unit_price: number | null; amount: number | null; tax_rate: number | null }[] = [];
  let existingTaxes: { tax_type: TaxType; rate: number | null; amount: number; jurisdiction: string | null }[] = [];
  if (existing) {
    const [{ data: gLineItems }, { data: gTaxes }] = await Promise.all([
      supabase
        .from("generated_invoice_line_items")
        .select("*")
        .eq("generated_invoice_id", existing.id)
        .order("line_no", { ascending: true, nullsFirst: false }),
      supabase
        .from("generated_invoice_taxes")
        .select("*")
        .eq("generated_invoice_id", existing.id),
    ]);
    existingLineItems = gLineItems ?? [];
    existingTaxes = gTaxes ?? [];
  }

  const bizList = businesses ?? [];
  const defaultBusinessId = existing?.business_id ?? expense.business_id ?? bizList[0]?.id ?? "";
  const defaultBiz = bizList.find((b) => b.id === defaultBusinessId) ?? null;

  const pdfUrl = existing?.pdf_storage_path
    ? await createSignedDocumentUrl(supabase, existing.pdf_storage_path, 3600, false, GENERATED_INVOICE_BUCKET)
    : null;

  const bizAssetUrls = await Promise.all(
    bizList.map(async (b) => ({
      id: b.id,
      logoUrl: b.logo_storage_path
        ? await createSignedDocumentUrl(supabase, b.logo_storage_path, 3600, false, ASSET_BUCKET)
        : null,
      signatureUrl: b.signature_storage_path
        ? await createSignedDocumentUrl(supabase, b.signature_storage_path, 3600, false, ASSET_BUCKET)
        : null,
    })),
  );
  const assetUrlByBusiness = new Map(bizAssetUrls.map((a) => [a.id, a]));

  const data: ConvertFormData = {
    sourceExpenseId: expense.id,
    generatedInvoiceId: existing?.id ?? null,
    status: existing?.status === "confirmed" ? "confirmed" : existing ? "draft" : null,
    canConfirm: expense.status === "confirmed" || expense.status === "exported",
    ourInvoiceNumber: existing?.our_invoice_number ?? null,
    pdfUrl,
    businesses: bizList.map((b) => ({
      id: b.id,
      name: b.name,
      legal_name: b.legal_name,
      gstin: b.gstin,
      gst_state_code: b.gst_state_code,
      address: b.address,
      bank_account_name: b.bank_account_name,
      bank_account_number: b.bank_account_number,
      bank_ifsc: b.bank_ifsc,
      bank_name: b.bank_name,
      signature_storage_path: b.signature_storage_path,
      logo_storage_path: b.logo_storage_path,
      terms_and_conditions: b.terms_and_conditions,
      logoUrl: assetUrlByBusiness.get(b.id)?.logoUrl ?? null,
      signatureUrl: assetUrlByBusiness.get(b.id)?.signatureUrl ?? null,
    })),
    initial: {
      business_id: defaultBusinessId,
      counterparty: {
        name: existing?.counterparty.name ?? vendor?.name ?? "",
        tax_id: existing?.counterparty.tax_id ?? vendor?.tax_id ?? "",
        tax_id_type: existing?.counterparty.tax_id_type ?? vendor?.tax_id_type ?? "GSTIN",
        address: existing?.counterparty.address ?? "",
        country: existing?.counterparty.country ?? vendor?.country ?? expense.country ?? "IN",
      },
      our_business: {
        name: existing?.our_business.name ?? defaultBiz?.name ?? "",
        legal_name: existing?.our_business.legal_name ?? defaultBiz?.legal_name ?? "",
        gstin: existing?.our_business.gstin ?? defaultBiz?.gstin ?? "",
        gst_state_code:
          existing?.our_business.gst_state_code ?? defaultBiz?.gst_state_code ?? "",
        address: existing?.our_business.address ?? defaultBiz?.address ?? "",
        bank_account_name:
          existing?.our_business.bank_account_name ?? defaultBiz?.bank_account_name ?? "",
        bank_account_number:
          existing?.our_business.bank_account_number ?? defaultBiz?.bank_account_number ?? "",
        bank_ifsc: existing?.our_business.bank_ifsc ?? defaultBiz?.bank_ifsc ?? "",
        bank_name: existing?.our_business.bank_name ?? defaultBiz?.bank_name ?? "",
        signature_storage_path:
          existing?.our_business.signature_storage_path ??
          defaultBiz?.signature_storage_path ??
          "",
        logo_storage_path:
          existing?.our_business.logo_storage_path ?? defaultBiz?.logo_storage_path ?? "",
        terms_and_conditions:
          existing?.our_business.terms_and_conditions ?? defaultBiz?.terms_and_conditions ?? "",
      },
      our_invoice_date: existing?.our_invoice_date ?? expense.invoice_date ?? todayIso(),
      currency: existing?.currency ?? expense.currency ?? "INR",
      subtotal: existing?.subtotal ?? expense.subtotal ?? "",
      tax_total: existing?.tax_total ?? expense.tax_total ?? "",
      total: existing?.total ?? expense.total ?? "",
      notes: existing?.notes ?? expense.notes ?? "",
      line_items: (existing ? existingLineItems : (lineItems ?? [])).map((li) => ({
        description: li.description ?? "",
        hsn_sac: li.hsn_sac ?? "",
        quantity: li.quantity ?? "",
        unit_price: li.unit_price ?? "",
        amount: li.amount ?? "",
        tax_rate: li.tax_rate ?? "",
      })),
      taxes: (existing ? existingTaxes : (taxes ?? [])).map((t) => ({
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
        title="Convert to Invoice"
        description="Merge the extracted data with your own business details into a numbered tax-invoice PDF."
      />
      <ConvertForm data={data} />
    </>
  );
}
