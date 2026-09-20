/**
 * Password-reset links are supposed to land on /auth/reset, but if Supabase's
 * "Redirect URLs" list doesn't include that address it sends the person to the
 * site's home page instead, carrying the one-time `code` (or `token_hash`).
 * Nothing on the home page reads it, so the reset silently goes nowhere.
 *
 * Metaphor: a parcel delivered to the front gate instead of the reception desk
 * — this is the guard who spots the parcel label and walks it to reception.
 *
 * Returns the /auth/reset address to forward to, or null when the request is
 * not a stray reset link. Only the home page and /login are ever forwarded, and
 * only the known one-time parameters are carried over.
 */
export function recoveryForwardUrl(url: URL): URL | null {
  if (url.pathname !== "/" && url.pathname !== "/login") return null;

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (!code && !tokenHash) return null;

  const dest = new URL("/auth/reset", url.origin);
  if (code) dest.searchParams.set("code", code);
  if (tokenHash) dest.searchParams.set("token_hash", tokenHash);
  return dest;
}
