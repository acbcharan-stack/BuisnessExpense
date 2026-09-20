import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { recoveryForwardUrl } from "@/lib/supabase/recovery";

/** Paths that never require an authenticated session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth", // callback + password-reset routes
  "/api/inbound-email", // authenticated via HMAC, not a user session
  "/api/cron", // authenticated via CRON_SECRET
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every request and gates private
 * routes. Run from the root `proxy.ts` (Next.js 16's renamed middleware).
 */
export async function updateSession(request: NextRequest) {
  // A reset link that landed on the home page / login instead of /auth/reset.
  const forward = recoveryForwardUrl(request.nextUrl);
  if (forward) return NextResponse.redirect(forward);

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getClaims()/getUser() must be called to trigger the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // A signed-in user is normally bounced off /login, but not when a reset link
  // just failed — otherwise the failure is hidden and they land in the app
  // with no explanation (the login page shows the notice).
  if (
    user &&
    pathname === "/login" &&
    !request.nextUrl.searchParams.has("reset")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
