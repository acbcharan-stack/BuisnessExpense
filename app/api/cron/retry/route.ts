import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import {
  claimableJobsFilter,
  MAX_ATTEMPTS,
  runExtractionJob,
} from "@/lib/extraction/pipeline";

export const maxDuration = 300;

const BATCH = 5;

/** Constant-time compare so response timing can't leak the secret. */
function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sweeps stuck / failed extraction jobs. Called by Vercel Cron (see
 * vercel.json) and authenticated with CRON_SECRET.
 */
export async function GET(request: Request) {
  const { cronSecret } = getServerEnv();
  if (!cronSecret || !secretMatches(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Waiting jobs, plus ones stranded in `running` by a function that was killed.
  const { data: jobs } = await admin
    .from("extraction_jobs")
    .select("id")
    .neq("status", "done")
    .or(claimableJobsFilter())
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
