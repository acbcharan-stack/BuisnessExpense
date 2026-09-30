import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestDocument } from "@/lib/documents/ingest";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

export const maxDuration = 60;

/** Multipart framing adds a little on top of the file itself. */
const BODY_OVERHEAD_BYTES = 1024 * 1024;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Fallback upload path through the app server (size-capped by the host). The
 * Inbox sends files straight to storage instead — see ./upload-url and
 * ./finalize — and only lands here if the browser can't tell the file's type.
 */
export async function POST(request: Request) {
  // 1. Who is this? Verified token + profile, on every request.
  const user = await requireApiUser();
  if (!user) return fail("Not signed in.", 401);

  // 2. Cheap size check on the declared length before reading the body.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + BODY_OVERHEAD_BYTES) {
    return fail("File is larger than 25 MB.", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Could not read the upload. Please try again.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file provided.", 400);
  if (file.size === 0) return fail("That file is empty.", 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail("File is larger than 25 MB.", 413);

  // 3. Type, size (again, on the real bytes), de-dupe, store, extract.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { status, body } = await ingestDocument({
    admin: createAdminClient(),
    userId: user.id,
    bytes,
    filename: file.name,
  });
  return NextResponse.json(body, { status });
}
