"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/supabase/auth";
import { UUID_RE } from "@/lib/uuid";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface BusinessInput {
  id?: string;
  name: string;
  legal_name?: string;
  gstin?: string;
  gst_state_code?: string;
  address?: string;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** Create or update a business. Any signed-in user. */
export async function saveBusiness(input: BusinessInput): Promise<ActionResult> {
  await requireProfile();

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 60) return { ok: false, error: "Name is too long." };

  const gstin = (input.gstin ?? "").trim().toUpperCase() || null;
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    return { ok: false, error: "GSTIN must be exactly 15 letters/digits." };
  }
  const stateCode = (input.gst_state_code ?? "").trim() || null;
  if (stateCode && !/^\d{1,2}$/.test(stateCode)) {
    return { ok: false, error: "GST state code must be 1–2 digits." };
  }

  const row = {
    name,
    legal_name: clean(input.legal_name),
    gstin,
    gst_state_code: stateCode,
    address: clean(input.address),
  };

  const admin = createAdminClient();

  if (input.id) {
    if (!UUID_RE.test(input.id)) {
      return { ok: false, error: "Invalid business id." };
    }
    const { error } = await admin
      .from("businesses")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("businesses").insert(row);
    if (error) {
      return {
        ok: false,
        error: /duplicate|unique/i.test(error.message)
          ? "A business with that name already exists."
          : error.message,
      };
    }
  }

  revalidatePath("/settings");
  revalidatePath("/invoices");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}
