"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, assertRole } from "@/lib/supabase/auth";
import { normalizeVendorName } from "@/lib/extraction/match";
import { removeDocumentObject } from "@/lib/supabase/storage";
import { UUID_RE } from "@/lib/uuid";
import type { CustomField, ProfileRow } from "@/lib/supabase/database.types";
import {
  recordFormSchema,
  type RecordFormValues,
  type RecordFormParsed,
} from "./form-schema";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Keep only rows with a label; coerce to plain strings for jsonb storage. */
function cleanCustomFields(rows: RecordFormParsed["custom_fields"]): CustomField[] {
  return rows
    .filter((r) => r.label)
    .map((r) => ({ label: r.label as string, value: r.value ?? "" }));
}

/** null, or a UUID that actually exists in `businesses` (defensive). */
async function resolveBusinessId(
  admin: Admin,
  raw: string | null,
): Promise<string | null> {
  if (!raw || !UUID_RE.test(raw)) return null;
  const { data } = await admin
    .from("businesses")
    .select("id")
    .eq("id", raw)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolveCategoryId(
  admin: Admin,
  v: RecordFormParsed,
): Promise<string | null> {
  if (!v.new_category_name) return v.category_id;
  const { data: existing } = await admin
    .from("categories")
    .select("id")
    .ilike("name", v.new_category_name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await admin
    .from("categories")
    .insert({ name: v.new_category_name, default_record_type: v.record_type })
    .select("id")
    .single();
  return created?.id ?? v.category_id;
}

async function resolveVendorId(
  admin: Admin,
  profile: ProfileRow,
  v: RecordFormParsed,
  fallbackId: string | null,
): Promise<string | null> {
  if (!v.vendor_name) return null;
  const normalized = normalizeVendorName(v.vendor_name);
  const { data: match } = await admin
    .from("vendors")
    .select("id")
    .eq("normalized_name", normalized)
    .eq("country", v.country)
    .maybeSingle();
  if (match) return match.id;
  const { data: created } = await admin
    .from("vendors")
    .insert({
      name: v.vendor_name,
      normalized_name: normalized,
      country: v.country,
      created_by: profile.id,
    })
    .select("id")
    .single();
  return created?.id ?? fallbackId;
}

function lineItemRows(expenseId: string, v: RecordFormParsed) {
  return v.line_items.map((li, i) => ({
    expense_id: expenseId,
    line_no: i + 1,
    description: li.description,
    hsn_sac: li.hsn_sac,
    quantity: li.quantity,
    unit_price: li.unit_price,
    amount: li.amount,
    tax_rate: li.tax_rate,
  }));
}
function taxRows(expenseId: string, v: RecordFormParsed) {
  return v.taxes.map((t) => ({
    expense_id: expenseId,
    tax_type: t.tax_type,
    rate: t.rate,
    amount: t.amount ?? 0,
    jurisdiction: t.jurisdiction,
  }));
}

export async function saveRecord(
  expenseId: string,
  values: RecordFormValues,
): Promise<ActionResult> {
  if (!UUID_RE.test(expenseId)) {
    return { ok: false, error: "Invalid record id." };
  }
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const parsed = recordFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  }
  const v = parsed.data;

  const { data: current } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", expenseId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Record not found." };

  // A record in `review` is editable by any writer. A `confirmed` record can
  // still be corrected, but only by a manager (owner / accountant). `exported`
  // and `archived` are locked.
  if (current.status === "exported" || current.status === "archived") {
    return { ok: false, error: `A ${current.status} record can't be edited.` };
  }
  if (current.status === "confirmed") {
    try {
      assertRole(profile, ["owner", "accountant"]);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const categoryId = await resolveCategoryId(admin, v);
  const vendorId = await resolveVendorId(admin, profile, v, current.vendor_id);
  const businessId = await resolveBusinessId(admin, v.business_id);
  const amountInr = v.currency === "INR" ? v.total : current.amount_inr;

  const { error: updErr } = await supabase
    .from("expenses")
    .update({
      record_type: v.record_type,
      business_id: businessId,
      vendor_id: vendorId,
      category_id: categoryId,
      category_set_by: profile.id,
      invoice_number: v.invoice_number,
      invoice_date: v.invoice_date,
      due_date: v.due_date,
      currency: v.currency,
      country: v.country,
      subtotal: v.subtotal,
      tax_total: v.tax_total,
      total: v.total,
      amount_inr: amountInr,
      notes: v.notes,
      custom_fields: cleanCustomFields(v.custom_fields),
    })
    .eq("id", expenseId);
  if (updErr) return { ok: false, error: updErr.message };

  await supabase.from("expense_line_items").delete().eq("expense_id", expenseId);
  await supabase.from("expense_taxes").delete().eq("expense_id", expenseId);
  if (v.line_items.length) {
    await supabase.from("expense_line_items").insert(lineItemRows(expenseId, v));
  }
  if (v.taxes.length) {
    await supabase.from("expense_taxes").insert(taxRows(expenseId, v));
  }

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "expense",
    entity_id: expenseId,
    action: "save",
    diff: { before: current, after: v },
  });

  revalidatePath(`/records/${expenseId}`);
  revalidatePath("/inbox");
  return { ok: true };
}

/** Create a record by hand — no source document, no AI extraction. */
export async function createManualRecord(
  values: RecordFormValues,
): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    assertRole(profile, ["owner", "accountant", "staff"]);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = recordFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const admin = createAdminClient();

  const categoryId = await resolveCategoryId(admin, v);
  const vendorId = await resolveVendorId(admin, profile, v, null);
  const businessId = await resolveBusinessId(admin, v.business_id);

  const { data: created, error } = await supabase
    .from("expenses")
    .insert({
      document_id: null,
      record_type: v.record_type,
      business_id: businessId,
      vendor_id: vendorId,
      category_id: categoryId,
      category_set_by: profile.id,
      invoice_number: v.invoice_number,
      invoice_date: v.invoice_date,
      due_date: v.due_date,
      currency: v.currency,
      country: v.country,
      subtotal: v.subtotal,
      tax_total: v.tax_total,
      total: v.total,
      amount_inr: v.currency === "INR" ? v.total : null,
      notes: v.notes,
      custom_fields: cleanCustomFields(v.custom_fields),
      status: "review",
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "Could not create the record." };
  }

  if (v.line_items.length) {
    await supabase
      .from("expense_line_items")
      .insert(lineItemRows(created.id, v));
  }
  if (v.taxes.length) {
    await supabase.from("expense_taxes").insert(taxRows(created.id, v));
  }

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "expense",
    entity_id: created.id,
    action: "create_manual",
    diff: { after: v },
  });

  revalidatePath("/inbox");
  return { ok: true, id: created.id };
}

export async function deleteRecord(expenseId: string): Promise<ActionResult> {
  if (!UUID_RE.test(expenseId)) {
    return { ok: false, error: "Invalid record id." };
  }
  const profile = await requireProfile();
  try {
    assertRole(profile, ["owner", "accountant"]);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: current } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", expenseId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Record not found." };
  if (current.status === "exported") {
    return {
      ok: false,
      error: "An exported record can't be deleted — archive it instead.",
    };
  }

  if (current.document_id) {
    const { data: doc } = await admin
      .from("documents")
      .select("storage_path")
      .eq("id", current.document_id)
      .maybeSingle();
    // Removing the document cascades to expenses / line items / taxes / jobs.
    const { error } = await admin
      .from("documents")
      .delete()
      .eq("id", current.document_id);
    if (error) return { ok: false, error: error.message };
    if (doc?.storage_path) await removeDocumentObject(admin, doc.storage_path);
  } else {
    const { error } = await admin
      .from("expenses")
      .delete()
      .eq("id", expenseId);
    if (error) return { ok: false, error: error.message };
  }

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "expense",
    entity_id: expenseId,
    action: "delete",
    diff: { before: current },
  });

  revalidatePath("/invoices");
  revalidatePath("/expenses");
  revalidatePath("/inbox");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function confirmRecord(expenseId: string): Promise<ActionResult> {
  if (!UUID_RE.test(expenseId)) {
    return { ok: false, error: "Invalid record id." };
  }
  const profile = await requireProfile();
  try {
    assertRole(profile, ["owner", "accountant"]);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("expenses")
    .select("id, status")
    .eq("id", expenseId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Record not found." };
  if (current.status !== "review") {
    return { ok: false, error: `Already ${current.status}.` };
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "confirmed",
      confirmed_by: profile.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", expenseId);
  if (error) return { ok: false, error: error.message };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    entity: "expense",
    entity_id: expenseId,
    action: "confirm",
    diff: null,
  });

  revalidatePath(`/records/${expenseId}`);
  revalidatePath("/inbox");
  revalidatePath("/invoices");
  revalidatePath("/expenses");
  return { ok: true };
}
