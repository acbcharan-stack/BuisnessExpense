import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { STORAGE_BUCKET } from "@/lib/constants";

/** Time-limited URL for viewing a private document. */
export async function createSignedDocumentUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
