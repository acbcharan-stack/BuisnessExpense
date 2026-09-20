import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { SOCIAL_BUCKET } from "@/lib/constants";

/** How long a viewing link stays valid. Re-issued on every page load. */
const VIEW_LINK_SECONDS = 3600;

/**
 * One batched request that turns storage paths into short-lived viewing
 * links. The bucket is private, so a picture's address alone is useless
 * without one of these — like a visitor pass that expires after an hour.
 */
export async function signSocialUrls(
  supabase: SupabaseClient<Database>,
  paths: string[],
  /** true = links that save the file instead of showing it. */
  download = false,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await supabase.storage
    .from(SOCIAL_BUCKET)
    .createSignedUrls(
      paths,
      VIEW_LINK_SECONDS,
      download ? { download: true } : undefined,
    );
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** id -> display name for a set of profile ids. */
export async function loadAuthorNames(
  supabase: SupabaseClient<Database>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  for (const p of data ?? []) out.set(p.id, p.full_name || "Teammate");
  return out;
}

export const FORMER_AUTHOR = "Former teammate";

/** "19 Sep 2026, 3:45 pm" in the shop's time zone. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
