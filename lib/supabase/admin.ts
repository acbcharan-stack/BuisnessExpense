import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server code
 * (cron jobs, the extraction pipeline, the inbound-email webhook).
 * Never import this into anything that reaches the browser.
 */
export function createAdminClient() {
  const { supabaseServiceRoleKey } = getServerEnv();
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
