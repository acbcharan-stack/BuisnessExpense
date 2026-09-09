import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";
import type { UserRole } from "@/lib/types";

/** Returns the signed-in auth user, or null. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the current user's profile row (id, full_name, role).
 * Redirects to /login when there is no session.
 */
export async function requireProfile(): Promise<ProfileRow> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
}

export function assertRole(
  profile: Pick<ProfileRow, "role">,
  allowed: UserRole[],
): void {
  if (!allowed.includes(profile.role)) {
    throw new Error("You do not have permission to perform this action.");
  }
}
