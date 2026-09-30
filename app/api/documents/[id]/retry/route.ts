import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtractionJob } from "@/lib/extraction/pipeline";
import { isUuid } from "@/lib/uuid";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // The id comes from the URL, so treat it as hostile until proven a UUID.
  const { id: documentId } = await params;
  if (!isUuid(documentId)) {
    return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
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
      console.error("[retry] could not create extraction job", error);
      return NextResponse.json(
        { error: "Could not queue extraction. Please try again." },
        { status: 500 },
      );
    }
    job = created;
  }

  // A manual retry gets a fresh attempt budget. The job is claimed atomically
  // inside runExtractionJob, so a double-click can't run it twice.
  const result = await runExtractionJob(admin, job.id, { resetAttempts: true });
  if (result.status === "busy") {
    return NextResponse.json(
      { error: "This document is already being processed. Give it a moment." },
      { status: 409 },
    );
  }
  return NextResponse.json({
    jobStatus: result.status,
    expenseId: result.expenseId ?? null,
    error: result.status === "error" ? result.error : undefined,
  });
}
