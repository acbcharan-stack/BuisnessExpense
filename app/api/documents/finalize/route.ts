import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeUploadSchema } from "@/lib/documents/direct-upload";
import { ingestDocument } from "@/lib/documents/ingest";
import { MAX_UPLOAD_BYTES, STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 60;

/**
 * Step 2 of a direct image upload. The browser claims "it's uploaded". We don't
 * take its word: we fetch the stored file ourselves, check what it really is,
 * and delete it if it isn't a genuine image — then carry on exactly like a
 * normal upload (de-dupe, record, extract).
 *
 * Metaphor: after the visitor drops a parcel in the locker, staff open it and
 * inspect it before it goes anywhere.
 */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = finalizeUploadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { path, filename } = parsed.data;

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(path);
  if (error || !blob) {
    return NextResponse.json(
      { error: "The upload didn't arrive. Please try again." },
      { status: 404 },
    );
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    await admin.storage.from(STORAGE_BUCKET).remove([path]);
    return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 413 });
  }

  const { status, body } = await ingestDocument({
    admin,
    userId: user.id,
    bytes: new Uint8Array(await blob.arrayBuffer()),
    filename,
    storedPath: path,
  });
  return NextResponse.json(body, { status });
}
