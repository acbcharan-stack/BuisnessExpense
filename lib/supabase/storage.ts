import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { STORAGE_BUCKET } from "@/lib/constants";

/**
 * Time-limited URL for a private document.
 * Pass `download` (true, or a filename) to get a URL whose response is
 * `Content-Disposition: attachment`, so the browser saves the file instead
 * of rendering it inline.
 */
export async function createSignedDocumentUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 3600,
  download?: boolean | string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(
      storagePath,
      expiresInSeconds,
      download ? { download } : undefined,
    );
  if (error || !data) return null;
  return data.signedUrl;
}

/** Permanently remove a document's file from the private bucket. */
export async function removeDocumentObject(
  admin: SupabaseClient<Database>,
  storagePath: string,
): Promise<void> {
  await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
}
