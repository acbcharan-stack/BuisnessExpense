import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runExtractionJob } from "@/lib/extraction/pipeline";
import { detectMimeType, sanitizeFilename } from "@/lib/file-signature";
import { extensionForMime, sha256Hex } from "@/lib/hash";
import { MAX_UPLOAD_BYTES, STORAGE_BUCKET } from "@/lib/constants";

type Admin = SupabaseClient<Database>;

const UNIQUE_VIOLATION = "23505";

export interface IngestResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (error: string, status: number): IngestResult => ({
  status,
  body: { error },
});

/**
 * The same bytes were uploaded before. If that upload already produced a record
 * we just point at it. If it never did (extraction failed or stalled — the
 * common case after an AI outage) we run extraction again now, so re-uploading
 * a stuck file actually fixes it instead of dead-ending on "already uploaded".
 */
async function resumeExisting(admin: Admin, documentId: string): Promise<IngestResult> {
  const { data: expense } = await admin
    .from("expenses")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();
  if (expense) {
    return {
      status: 200,
      body: { documentId, expenseId: expense.id, duplicate: true, resumed: false },
    };
  }

  let { data: job } = await admin
    .from("extraction_jobs")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job) {
    const { data: created, error } = await admin
      .from("extraction_jobs")
      .insert({ document_id: documentId, status: "queued" })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[ingest] could not queue extraction for duplicate", error);
      return fail("Could not queue extraction. Please try again.", 500);
    }
    job = created;
  }

  const result = await runExtractionJob(admin, job.id, { resetAttempts: true });
  return {
    status: 200,
    body: {
      documentId,
      expenseId: result.expenseId ?? null,
      duplicate: true,
      resumed: true,
      jobStatus: result.status,
      error: result.status === "error" ? result.error : undefined,
    },
  };
}

/**
 * Everything that happens once the server holds a file's bytes: verify what it
 * really is, de-dupe, store, record, and run extraction.
 *
 * `storedPath` is set when the browser already put the file into storage by
 * itself (direct upload). In that case we never trust it: we validate the bytes
 * we read back, and any file we reject is deleted so nothing unchecked lingers.
 */
export async function ingestDocument(params: {
  admin: Admin;
  userId: string;
  bytes: Uint8Array;
  filename: string;
  storedPath?: string;
}): Promise<IngestResult> {
  const { admin, userId, bytes, storedPath } = params;
  const discardStored = async () => {
    if (storedPath) await admin.storage.from(STORAGE_BUCKET).remove([storedPath]);
  };

  if (bytes.length === 0) {
    await discardStored();
    return fail("That file is empty.", 400);
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    await discardStored();
    return fail("File is larger than 25 MB.", 413);
  }
  const mimeType = detectMimeType(bytes);
  if (!mimeType) {
    await discardStored();
    return fail("This doesn't look like a JPG, PNG, WebP, HEIC or PDF file.", 415);
  }
  const filename = sanitizeFilename(params.filename);
  const sha256 = sha256Hex(bytes);

  // De-dupe: same bytes already uploaded?
  const { data: dupe } = await admin
    .from("documents")
    .select("id, storage_path")
    .eq("sha256", sha256)
    .maybeSingle();
  if (dupe) {
    // Only delete the newly stored copy — never the file the record points to
    // (which is what a repeated "finalize" of the same path would hit).
    if (storedPath && dupe.storage_path !== storedPath) await discardStored();
    return resumeExisting(admin, dupe.id);
  }

  // Store under a random name we choose (never the user's), unless it's there already.
  const path = storedPath ?? `${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
  if (!storedPath) {
    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) {
      console.error("[ingest] storage upload failed", uploadError);
      return fail("Could not store the file. Please try again.", 502);
    }
  }

  const { data: doc, error: docError } = await admin
    .from("documents")
    .insert({
      storage_path: path,
      original_filename: filename,
      mime_type: mimeType,
      size_bytes: bytes.length,
      sha256,
      source: "upload",
      uploaded_by: userId,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await admin.storage.from(STORAGE_BUCKET).remove([path]);
    // Two simultaneous uploads of the same file: the unique index on sha256
    // lets one win; the loser joins it instead of erroring.
    if (docError?.code === UNIQUE_VIOLATION) {
      const { data: winner } = await admin
        .from("documents")
        .select("id")
        .eq("sha256", sha256)
        .maybeSingle();
      if (winner) return resumeExisting(admin, winner.id);
    }
    console.error("[ingest] could not record document", docError);
    return fail("Could not record the document. Please try again.", 500);
  }

  const { data: job, error: jobError } = await admin
    .from("extraction_jobs")
    .insert({ document_id: doc.id, status: "queued" })
    .select("id")
    .single();
  if (jobError || !job) {
    console.error("[ingest] could not queue extraction", jobError);
    // The document is safely stored; the Inbox lists it and Retry re-creates the job.
    return {
      status: 200,
      body: {
        documentId: doc.id,
        expenseId: null,
        duplicate: false,
        jobStatus: "error",
        error: "Saved, but extraction could not be queued. Press Retry in the list below.",
      },
    };
  }

  // Extract inline so the UI can show a result immediately. If it fails the job
  // is left for the retry sweep / manual Retry.
  const result = await runExtractionJob(admin, job.id);
  return {
    status: 200,
    body: {
      documentId: doc.id,
      expenseId: result.expenseId ?? null,
      duplicate: false,
      jobStatus: result.status,
      error: result.status === "error" ? result.error : undefined,
    },
  };
}
