import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { TaxIdType } from "@/lib/types";

type Admin = SupabaseClient<Database>;

const VENDOR_SUFFIXES =
  /\b(private|pvt|limited|ltd|llp|inc|co|company|corporation|corp|and|&)\b/gi;

/** Loose key for de-duplicating vendor names ("A.B.C. Pvt Ltd" ≈ "abc"). */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^*;:{}=\-_`~()]/g, " ")
    .replace(VENDOR_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds a vendor by normalized name (+ country), creating one if none exists.
 * Returns the vendor id, or null when no usable name was extracted.
 */
export async function findOrCreateVendor(
  admin: Admin,
  input: {
    name: string | null;
    taxId: string | null;
    taxIdType: TaxIdType | null;
    country: string | null;
    createdBy: string | null;
  },
): Promise<string | null> {
  if (!input.name) return null;
  const country = (input.country || "IN").toUpperCase();
  const normalized = normalizeVendorName(input.name);
  if (!normalized) return null;

  const { data: existing } = await admin
    .from("vendors")
    .select("id")
    .eq("normalized_name", normalized)
    .eq("country", country)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from("vendors")
    .insert({
      name: input.name.trim(),
      normalized_name: normalized,
      tax_id: input.taxId,
      tax_id_type: input.taxIdType,
      country,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    // Lost a race — fetch the row the other writer created.
    const { data: race } = await admin
      .from("vendors")
      .select("id")
      .eq("normalized_name", normalized)
      .eq("country", country)
      .maybeSingle();
    return race?.id ?? null;
  }
  return created.id;
}

/** Case-insensitive exact match of a suggested category name to a seeded one. */
export async function matchCategoryId(
  admin: Admin,
  suggested: string | null,
): Promise<string | null> {
  if (!suggested) return null;
  const { data } = await admin
    .from("categories")
    .select("id")
    .ilike("name", suggested.trim())
    .maybeSingle();
  return data?.id ?? null;
}
