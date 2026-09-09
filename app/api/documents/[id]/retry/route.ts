import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtractionJob } from "@/lib/extraction/pipeline";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("extraction_jobs")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    return NextResponse.json(
      { error: "No extraction job for that document." },
      { status: 404 },
    );
  }

  await admin
    .from("extraction_jobs")
    .update({
      status: "queued",
      last_error: null,
      scheduled_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  const result = await runExtractionJob(admin, job.id);
  return NextResponse.json({
    jobStatus: result.status,
    expenseId: result.expenseId ?? null,
    error: result.status === "error" ? result.error : undefined,
  });
}
