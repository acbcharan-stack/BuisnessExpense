import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtractionJob } from "@/lib/extraction/pipeline";
import { sha256Hex, extensionForMime } from "@/lib/hash";
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  STORAGE_BUCKET,
} from "@/lib/constants";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ACCEPTED_MIME_TYPES.includes(mimeType as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is larger than 25 MB." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = sha256Hex(bytes);

  // De-dupe: same bytes already uploaded?
  const { data: dupe } = await supabase
    .from("documents")
    .select("id, status")
    .eq("sha256", sha256)
    .maybeSingle();
  if (dupe) {
    const { data: dupeExpense } = await supabase
      .from("expenses")
      .select("id")
      .eq("document_id", dupe.id)
      .maybeSingle();
    return NextResponse.json({
      documentId: dupe.id,
      expenseId: dupeExpense?.id ?? null,
      duplicate: true,
      jobStatus: dupe.status,
    });
  }

  const admin = createAdminClient();
  const path = `${crypto.randomUUID()}.${extensionForMime(mimeType)}`;

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 502 },
    );
  }

  const { data: doc, error: docError } = await admin
    .from("documents")
    .insert({
      storage_path: path,
      original_filename: file.name,
      mime_type: mimeType,
      size_bytes: file.size,
      sha256,
      source: "upload",
      uploaded_by: user.id,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await admin.storage.from(STORAGE_BUCKET).remove([path]);
    return NextResponse.json(
      { error: `Could not record document: ${docError?.message}` },
      { status: 500 },
    );
  }

  const { data: job, error: jobError } = await admin
    .from("extraction_jobs")
    .insert({ document_id: doc.id, status: "queued" })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json(
      { error: `Could not queue extraction: ${jobError?.message}` },
      { status: 500 },
    );
  }

  // Extract inline so the UI can show a result immediately. If it fails the job
  // is left for the retry sweep / manual retry.
  const result = await runExtractionJob(admin, job.id);

  return NextResponse.json({
    documentId: doc.id,
    expenseId: result.expenseId ?? null,
    duplicate: false,
    jobStatus: result.status,
    error: result.status === "error" ? result.error : undefined,
  });
}
