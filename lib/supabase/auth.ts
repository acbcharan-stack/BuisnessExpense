import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * Returns the signed-in auth user, or null.
 *
 * Wrapped in React `cache` so that when several server components in one render
 * (the app layout and the page inside it, say) each ask "who is signed in?",
 * the token is verified with Supabase once per request, not once per caller.
 * Metaphor: the doorman checks your ID once when you enter, not again at every
 * room — but it is still checked fresh on every new visit.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Returns the current user's profile row (id, full_name, role).
 * Redirects to /login when there is no session. Also `cache`d per request.
 */
export const requireProfile = cache(async (): Promise<ProfileRow> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // Auth user with no profile row — should not happen (trigger creates it).
    redirect("/login");
  }
  return profile;
});
