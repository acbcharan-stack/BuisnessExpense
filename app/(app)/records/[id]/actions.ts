"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, assertRole } from "@/lib/supabase/auth";
import { normalizeVendorName } from "@/lib/extraction/match";
import { recordFormSchema, type RecordFormValues } from "./form-schema";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function saveRecord(
  expenseId: string,
  values: RecordFormValues,
): Promise<ActionResult> {
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

  // Category: create a new one on the fly if the user typed a name.
  let categoryId = v.category_id;
  if (v.new_category_name) {
    const { data: existing } = await admin
      .from("categories")
      .select("id")
      .ilike("name", v.new_category_name)
      .maybeSingle();
    if (existing) {
      categoryId = existing.id;
    } else {
      const { data: created } = await admin
        .from("categories")
        .insert({
          name: v.new_category_name,
          default_record_type: v.record_type,
        })
        .select("id")
        .single();
      categoryId = created?.id ?? categoryId;
    }
  }

  // Vendor: match or create from the typed name.
  let vendorId = current.vendor_id;
  if (v.vendor_name) {
    const normalized = normalizeVendorName(v.vendor_name);
    const { data: match } = await admin
      .from("vendors")
      .select("id")
      .eq("normalized_name", normalized)
      .eq("country", v.country)
      .maybeSingle();
    if (match) {
      vendorId = match.id;
    } else {
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
      vendorId = created?.id ?? vendorId;
    }
  } else {
    vendorId = null;
  }

  const amountInr = v.currency === "INR" ? v.total : current.amount_inr;

  const { error: updErr } = await supabase
    .from("expenses")
    .update({
      record_type: v.record_type,
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
    })
    .eq("id", expenseId);
  if (updErr) return { ok: false, error: updErr.message };

  // Replace child rows.
  await supabase.from("expense_line_items").delete().eq("expense_id", expenseId);
  await supabase.from("expense_taxes").delete().eq("expense_id", expenseId);

  if (v.line_items.length) {
    await supabase.from("expense_line_items").insert(
      v.line_items.map((li, i) => ({
        expense_id: expenseId,
        line_no: i + 1,
        description: li.description,
        hsn_sac: li.hsn_sac,
        quantity: li.quantity,
        unit_price: li.unit_price,
        amount: li.amount,
        tax_rate: li.tax_rate,
      })),
    );
  }
  if (v.taxes.length) {
    await supabase.from("expense_taxes").insert(
      v.taxes.map((t) => ({
        expense_id: expenseId,
        tax_type: t.tax_type,
        rate: t.rate,
        amount: t.amount ?? 0,
        jurisdiction: t.jurisdiction,
      })),
    );
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

export async function confirmRecord(expenseId: string): Promise<ActionResult> {
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
