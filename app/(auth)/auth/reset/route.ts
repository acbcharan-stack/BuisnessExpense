import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** A short, safe-to-show label for an auth error (letters, digits, _ only). */
function reasonTag(error: { code?: string; name?: string }): string {
  const raw = error.code || error.name || "unknown";
  return raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "unknown";
}

/**
 * Landing point for the password-reset email link. Exchanges the PKCE code
 * (or recovery token) for a session, then sends the user to the
 * set-new-password form. On failure the login page is shown with a short
 * reason label, so "why did my link fail?" can be answered from a screenshot.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createClient();

  let why: string | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Reset link failed:", error.status, error.code, error.name, error.message);
      why = reasonTag(error);
    }
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error) {
      console.error("Reset link failed:", error.status, error.code, error.name, error.message);
      why = reasonTag(error);
    }
  } else {
    console.error("Reset link failed: no code or token_hash in the address");
    why = "no_code_in_link";
  }

  const dest = new URL(
    why === null
      ? "/auth/update-password"
      : `/login?reset=invalid&why=${encodeURIComponent(why)}`,
    url.origin,
  );
  return NextResponse.redirect(dest);
}
