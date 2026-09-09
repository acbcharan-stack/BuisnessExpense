import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the password-reset email link. Exchanges the PKCE code
 * (or recovery token) for a session, then sends the user to the
 * set-new-password form.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    ok = !error;
  }

  const dest = new URL(
    ok ? "/auth/update-password" : "/login?reset=invalid",
    url.origin,
  );
  return NextResponse.redirect(dest);
}
