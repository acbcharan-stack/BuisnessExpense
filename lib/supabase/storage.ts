import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { STORAGE_BUCKET } from "@/lib/constants";

/**
 * Time-limited URL for a private object in any of the app's storage buckets
 * (defaults to the main `documents` bucket). Pass `download` (true, or a
 * filename) to get a URL whose response is `Content-Disposition: attachment`,
 * so the browser saves the file instead of rendering it inline.
 */
export async function createSignedDocumentUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 3600,
  download?: boolean | string,
  bucket: string = STORAGE_BUCKET,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(
      storagePath,
      expiresInSeconds,
      download ? { download } : undefined,
    );
  if (error || !data) return null;
  return data.signedUrl;
}

/** Permanently remove an object from the given private bucket (default: `documents`). */
export async function removeDocumentObject(
  admin: SupabaseClient<Database>,
  storagePath: string,
  bucket: string = STORAGE_BUCKET,
): Promise<void> {
  await admin.storage.from(bucket).remove([storagePath]);
}
