"use server";

import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/supabase/auth";
import { createSignedDocumentUrl } from "@/lib/supabase/storage";
import { ASSET_BUCKET, GENERATED_INVOICE_BUCKET } from "@/lib/constants";
import { UUID_RE } from "@/lib/uuid";
import { fyLabelFor, formatInvoiceNumber } from "@/lib/pdf/invoice-number";
import { buildInvoiceRenderData } from "@/lib/pdf/invoice-render-data";
import { GeneratedInvoiceDocument } from "@/lib/pdf/invoice-template";
import type {
  CounterpartySnapshot,
  GeneratedInvoiceRow,
  OurBusinessSnapshot,
} from "@/lib/supabase/database.types";
import {
  generatedInvoiceFormSchema,
  type GeneratedInvoiceFormValues,
  type GeneratedInvoiceFormParsed,
} from "./form-schema";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

function lineItemRows(generatedInvoiceId: string, v: GeneratedInvoiceFormParsed) {
  return v.line_items.map((li, i) => ({
    generated_invoice_id: generatedInvoiceId,
    line_no: i + 1,
    description: li.description,
    hsn_sac: li.hsn_sac,
    quantity: li.quantity,
    unit_price: li.unit_price,
    amount: li.amount,
    tax_rate: li.tax_rate,
  }));
}
function taxRows(generatedInvoiceId: string, v: GeneratedInvoiceFormParsed) {
  return v.taxes.map((t) => ({
    generated_invoice_id: generatedInvoiceId,
    tax_type: t.tax_type,
    rate: t.rate,
    amount: t.amount ?? 0,
    jurisdiction: t.jurisdiction,
  }));
}

function toCounterpartySnapshot(v: GeneratedInvoiceFormParsed): CounterpartySnapshot {
  return {
    name: v.counterparty.name,
    tax_id: v.counterparty.tax_id,
    tax_id_type: v.counterparty.tax_id_type,
    address: v.counterparty.address,
    country: v.counterparty.country,
  };
}
function toOurBusinessSnapshot(v: GeneratedInvoiceFormParsed): OurBusinessSnapshot {
  return { ...v.our_business };
}

/** Renders the invoice PDF for this row's current data and uploads it. */
async function renderAndUploadPdf(
  admin: Admin,
  row: {
    id: string;
    direction: GeneratedInvoiceRow["direction"];
    business_id: string;
    counterparty: CounterpartySnapshot;
    our_business: OurBusinessSnapshot;
    our_invoice_number: string | null;
    our_invoice_date: string | null;
    currency: string;
    fy_label: string;
  },
  lineItems: GeneratedInvoiceFormParsed["line_items"],
  taxes: GeneratedInvoiceFormParsed["taxes"],
  totals: { subtotal: number | null; tax_total: number | null; total: number | null },
  notes: string | null,
): Promise<{ storagePath: string } | { error: string }> {
  const [logoUrl, signatureUrl] = await Promise.all([
    row.our_business.logo_storage_path
      ? createSignedDocumentUrl(admin, row.our_business.logo_storage_path, 300, false, ASSET_BUCKET)
      : Promise.resolve(null),
    row.our_business.signature_storage_path
      ? createSignedDocumentUrl(admin, row.our_business.signature_storage_path, 300, false, ASSET_BUCKET)
      : Promise.resolve(null),
  ]);

  const renderData = buildInvoiceRenderData({
    counterparty: row.counterparty,
    ourBusiness: row.our_business,
    ourInvoiceNumber: row.our_invoice_number,
    ourInvoiceDate: row.our_invoice_date,
    currency: row.currency,
    lineItems,
    taxes: taxes.map((t) => ({
      tax_type: t.tax_type,
      rate: t.rate,
      amount: t.amount ?? 0,
      jurisdiction: t.jurisdiction,
    })),
    subtotal: totals.subtotal,
    taxTotal: totals.tax_total,
    total: totals.total,
    notes,
  });

  let bytes: Buffer;
  try {
    bytes = await renderToBuffer(
      GeneratedInvoiceDocument({ data: renderData, logoUrl, signatureUrl }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not render the PDF." };
  }

  const storagePath = `${row.business_id}/${row.direction}/${row.fy_label}/${row.id}.pdf`;
  const { error } = await admin.storage
    .from(GENERATED_INVOICE_BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return { error: error.message };
  return { storagePath };
}

/** The active (non-void) generated invoice for a source record, if any. */
async function findActiveRow(admin: Admin, sourceExpenseId: string) {
  const { data } = await admin
    .from("generated_invoices")
    .select("*")
    .eq("source_expense_id", sourceExpenseId)
    .neq("status", "void")
    .maybeSingle();
  return data;
}

export async function saveGeneratedInvoiceDraft(
  sourceExpenseId: string,
  values: GeneratedInvoiceFormValues,
): Promise<ActionResult> {
  if (!UUID_RE.test(sourceExpenseId)) {
    return { ok: false, error: "Invalid record id." };
  }
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const parsed = generatedInvoiceFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  }
  const v = parsed.data;

  const { data: sourceExpense } = await supabase
    .from("expenses")
    .select("id, record_type")
    .eq("id", sourceExpenseId)
    .maybeSingle();
  if (!sourceExpense) return { ok: false, error: "Source record not found." };
  if (sourceExpense.record_type !== "invoice") {
    return { ok: false, error: "Only Purchase Order records can be converted." };
  }

  const existing = await findActiveRow(admin, sourceExpenseId);
  if (existing && existing.status === "confirmed") {
    return { ok: false, error: "This record already has a confirmed invoice." };
  }

  const fyLabel = fyLabelFor(v.our_invoice_date ? new Date(v.our_invoice_date) : new Date());
  const counterparty = toCounterpartySnapshot(v);
  const ourBusiness = toOurBusinessSnapshot(v);

  const rowValues = {
    source_expense_id: sourceExpenseId,
    direction: v.direction,
    business_id: v.business_id,
    counterparty,
    our_business: ourBusiness,
    our_invoice_date: v.our_invoice_date,
    fy_label: fyLabel,
    currency: v.currency,
    subtotal: v.subtotal,
    tax_total: v.tax_total,
    total: v.total,
    notes: v.notes,
  };

  let generatedInvoiceId = existing?.id;
  if (existing) {
    const { error } = await supabase
      .from("generated_invoices")
      .update(rowValues)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("generated_invoices")
      .insert({ ...rowValues, status: "draft", created_by: profile.id })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "Could not create the draft." };
    }
    generatedInvoiceId = created.id;
  }
  if (!generatedInvoiceId) return { ok: false, error: "Could not save the draft." };

  await supabase
    .from("generated_invoice_line_items")
    .delete()
    .eq("generated_invoice_id", generatedInvoiceId);
  await supabase
    .from("generated_invoice_taxes")
    .delete()
    .eq("generated_invoice_id", generatedInvoiceId);
  if (v.line_items.length) {
    await supabase
      .from("generated_invoice_line_items")
      .insert(lineItemRows(generatedInvoiceId, v));
  }
  if (v.taxes.length) {
    await supabase.from("generated_invoice_taxes").insert(taxRows(generatedInvoiceId, v));
  }

  const rendered = await renderAndUploadPdf(
    admin,
    {
      id: generatedInvoiceId,
      direction: v.direction,
      business_id: v.business_id,
      counterparty,
      our_business: ourBusiness,
      our_invoice_number: null,
      our_invoice_date: v.our_invoice_date,
      currency: v.currency,
      fy_label: fyLabel,
    },
    v.line_items,
    v.taxes,
    { subtotal: v.subtotal, tax_total: v.tax_total, total: v.total },
    v.notes,
  );
  if ("error" in rendered) return { ok: false, error: rendered.error };

  await supabase
    .from("generated_invoices")
    .update({ pdf_storage_path: rendered.storagePath, pdf_generated_at: new Date().toISOString() })
    .eq("id", generatedInvoiceId);

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "generated_invoice",
    entity_id: generatedInvoiceId,
    action: existing ? "save_draft" : "create_draft",
    diff: { after: v },
  });

  revalidatePath(`/records/${sourceExpenseId}`);
  revalidatePath(`/records/${sourceExpenseId}/convert`);
  return { ok: true, id: generatedInvoiceId };
}

export async function confirmGeneratedInvoice(
  generatedInvoiceId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(generatedInvoiceId)) {
    return { ok: false, error: "Invalid invoice id." };
  }
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: row } = await supabase
    .from("generated_invoices")
    .select("*")
    .eq("id", generatedInvoiceId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Draft not found." };
  if (row.status !== "draft") {
    return { ok: false, error: `Already ${row.status}.` };
  }

  const { data: sourceExpense } = await supabase
    .from("expenses")
    .select("id, status")
    .eq("id", row.source_expense_id)
    .maybeSingle();
  if (!sourceExpense) return { ok: false, error: "Source record not found." };
  if (sourceExpense.status !== "confirmed" && sourceExpense.status !== "exported") {
    return {
      ok: false,
      error: "Confirm the source Purchase Order record first, before finalizing its invoice.",
    };
  }

  const { data: business } = await admin
    .from("businesses")
    .select("name, invoice_prefix")
    .eq("id", row.business_id)
    .maybeSingle();
  if (!business) return { ok: false, error: "Issuing business not found." };

  const invoiceDate = row.our_invoice_date ?? new Date().toISOString().slice(0, 10);
  const fyLabel = fyLabelFor(new Date(invoiceDate));

  const { data: seq, error: seqError } = await admin.rpc("allocate_invoice_seq", {
    p_business_id: row.business_id,
    p_direction: row.direction,
    p_fy_label: fyLabel,
  });
  if (seqError || seq == null) {
    return { ok: false, error: seqError?.message ?? "Could not allocate an invoice number." };
  }

  const ourInvoiceNumber = formatInvoiceNumber({
    invoicePrefix: business.invoice_prefix,
    businessName: business.name,
    direction: row.direction,
    fyLabel,
    seq,
  });

  const [{ data: lineItems }, { data: taxes }] = await Promise.all([
    supabase
      .from("generated_invoice_line_items")
      .select("*")
      .eq("generated_invoice_id", generatedInvoiceId)
      .order("line_no", { ascending: true, nullsFirst: false }),
    supabase.from("generated_invoice_taxes").select("*").eq("generated_invoice_id", generatedInvoiceId),
  ]);

  const rendered = await renderAndUploadPdf(
    admin,
    {
      id: generatedInvoiceId,
      direction: row.direction,
      business_id: row.business_id,
      counterparty: row.counterparty,
      our_business: row.our_business,
      our_invoice_number: ourInvoiceNumber,
      our_invoice_date: invoiceDate,
      currency: row.currency,
      fy_label: fyLabel,
    },
    (lineItems ?? []).map((li) => ({
      description: li.description,
      hsn_sac: li.hsn_sac,
      quantity: li.quantity,
      unit_price: li.unit_price,
      amount: li.amount,
      tax_rate: li.tax_rate,
    })),
    (taxes ?? []).map((t) => ({
      tax_type: t.tax_type,
      rate: t.rate,
      amount: t.amount,
      jurisdiction: t.jurisdiction,
    })),
    { subtotal: row.subtotal, tax_total: row.tax_total, total: row.total },
    row.notes,
  );
  if ("error" in rendered) return { ok: false, error: rendered.error };

  const { error: updErr } = await supabase
    .from("generated_invoices")
    .update({
      status: "confirmed",
      our_invoice_number: ourInvoiceNumber,
      our_invoice_date: invoiceDate,
      fy_label: fyLabel,
      pdf_storage_path: rendered.storagePath,
      pdf_generated_at: new Date().toISOString(),
      confirmed_by: profile.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", generatedInvoiceId);
  if (updErr) return { ok: false, error: updErr.message };

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "generated_invoice",
    entity_id: generatedInvoiceId,
    action: "confirm",
    diff: { after: { our_invoice_number: ourInvoiceNumber } },
  });

  revalidatePath(`/records/${row.source_expense_id}`);
  revalidatePath(`/records/${row.source_expense_id}/convert`);
  return { ok: true, id: generatedInvoiceId };
}

export async function deleteGeneratedInvoiceDraft(
  generatedInvoiceId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(generatedInvoiceId)) {
    return { ok: false, error: "Invalid invoice id." };
  }
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: row } = await supabase
    .from("generated_invoices")
    .select("id, status, source_expense_id, pdf_storage_path")
    .eq("id", generatedInvoiceId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Draft not found." };
  if (row.status !== "draft") {
    return { ok: false, error: "Only a draft can be discarded." };
  }

  const { error } = await supabase
    .from("generated_invoices")
    .update({ status: "void" })
    .eq("id", generatedInvoiceId);
  if (error) return { ok: false, error: error.message };

  if (row.pdf_storage_path) {
    await admin.storage.from(GENERATED_INVOICE_BUCKET).remove([row.pdf_storage_path]);
  }

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "generated_invoice",
    entity_id: generatedInvoiceId,
    action: "void",
    diff: null,
  });

  revalidatePath(`/records/${row.source_expense_id}`);
  revalidatePath(`/records/${row.source_expense_id}/convert`);
  return { ok: true };
}
