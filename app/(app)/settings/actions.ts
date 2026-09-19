"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/supabase/auth";
import { UUID_RE } from "@/lib/uuid";
import { ASSET_BUCKET } from "@/lib/constants";

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
  bank_account_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_name?: string;
  invoice_prefix?: string;
  terms_and_conditions?: string;
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
  const ifsc = (input.bank_ifsc ?? "").trim().toUpperCase() || null;
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return { ok: false, error: "IFSC must look like HDFC0001234." };
  }

  const row = {
    name,
    legal_name: clean(input.legal_name),
    gstin,
    gst_state_code: stateCode,
    address: clean(input.address),
    bank_account_name: clean(input.bank_account_name),
    bank_account_number: clean(input.bank_account_number),
    bank_ifsc: ifsc,
    bank_name: clean(input.bank_name),
    invoice_prefix: clean(input.invoice_prefix)?.toUpperCase() ?? null,
    terms_and_conditions: clean(input.terms_and_conditions),
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

const ACCEPTED_ASSET_TYPES = new Set(["image/png", "image/jpeg"]);

function extFor(mimeType: string): string {
  return mimeType === "image/png" ? "png" : "jpg";
}

async function uploadBusinessAsset(
  businessId: string,
  file: File,
  kind: "signatures" | "logos",
  column: "signature_storage_path" | "logo_storage_path",
): Promise<ActionResult> {
  await requireProfile();
  if (!UUID_RE.test(businessId)) {
    return { ok: false, error: "Invalid business id." };
  }
  if (!ACCEPTED_ASSET_TYPES.has(file.type)) {
    return { ok: false, error: "Please upload a PNG or JPEG image." };
  }

  const admin = createAdminClient();
  const path = `${kind}/${businessId}.${extFor(file.type)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(ASSET_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { error } =
    column === "signature_storage_path"
      ? await admin.from("businesses").update({ signature_storage_path: path }).eq("id", businessId)
      : await admin.from("businesses").update({ logo_storage_path: path }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

async function removeBusinessAsset(
  businessId: string,
  column: "signature_storage_path" | "logo_storage_path",
): Promise<ActionResult> {
  await requireProfile();
  if (!UUID_RE.test(businessId)) {
    return { ok: false, error: "Invalid business id." };
  }
  const admin = createAdminClient();

  const { data: biz } = await admin
    .from("businesses")
    .select("signature_storage_path, logo_storage_path")
    .eq("id", businessId)
    .maybeSingle();
  const path = biz?.[column];

  const { error } =
    column === "signature_storage_path"
      ? await admin.from("businesses").update({ signature_storage_path: null }).eq("id", businessId)
      : await admin.from("businesses").update({ logo_storage_path: null }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  if (path) await admin.storage.from(ASSET_BUCKET).remove([path]);

  revalidatePath("/settings");
  return { ok: true };
}

export async function uploadBusinessSignature(
  businessId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  return uploadBusinessAsset(businessId, file, "signatures", "signature_storage_path");
}

export async function removeBusinessSignature(businessId: string): Promise<ActionResult> {
  return removeBusinessAsset(businessId, "signature_storage_path");
}

export async function uploadBusinessLogo(
  businessId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  return uploadBusinessAsset(businessId, file, "logos", "logo_storage_path");
}

export async function removeBusinessLogo(businessId: string): Promise<ActionResult> {
  return removeBusinessAsset(businessId, "logo_storage_path");
}
