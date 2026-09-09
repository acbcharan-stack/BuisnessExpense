import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { MAX_ATTEMPTS, runExtractionJob } from "@/lib/extraction/pipeline";

export const maxDuration = 300;

const BATCH = 5;

/**
 * Sweeps stuck / failed extraction jobs. Called by Vercel Cron (see
 * vercel.json) and authenticated with CRON_SECRET.
 */
export async function GET(request: Request) {
  const { cronSecret } = getServerEnv();
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: jobs } = await admin
    .from("extraction_jobs")
    .select("id")
    .in("status", ["queued", "error"])
    .lt("attempts", MAX_ATTEMPTS)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0, results: [] });
  }

  const results = [];
  for (const job of jobs) {
    results.push(await runExtractionJob(admin, job.id));
  }
  return NextResponse.json({ processed: results.length, results });
}
