import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * For API route handlers (which must answer with 401, never redirect).
 *
 * Two checks, both made fresh on every request:
 *  1. the session token is verified with Supabase (`getUser`, not the
 *     unverified cookie contents), and
 *  2. that user really has a `profiles` row — the app's definition of "allowed
 *     in". Routes that use the service-role key skip database row-level
 *     security, so this check is what keeps a stray account out.
 *
 * Metaphor: the doorman looks at your ID (token) *and* checks your name is on
 * the guest list (profile) before letting you into the back office.
 */
export async function requireApiUser(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  return profile ? { id: user.id } : null;
}
