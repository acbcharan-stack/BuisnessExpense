import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareUploadSchema } from "@/lib/documents/direct-upload";
import { extensionForMime } from "@/lib/hash";
import { STORAGE_BUCKET } from "@/lib/constants";

/**
 * Step 1 of a direct image upload. The browser says "I have an image of this
 * type and size"; we invent the file name and hand back a one-use upload slip.
 *
 * Metaphor: the front desk gives the visitor a key to ONE numbered locker. They
 * can't choose the locker, and they can't use the key on any other.
 */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = prepareUploadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Unsupported image, or larger than 25 MB." },
      { status: 400 },
    );
  }

  const path = `${crypto.randomUUID()}.${extensionForMime(parsed.data.type)}`;
  const { data, error } = await createAdminClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[upload-url] could not create signed upload", error);
    return NextResponse.json(
      { error: "Could not start the upload. Please try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ path, token: data.token });
}
