"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Catches a password-reset link that arrives with its token after a `#` (the
 * older "implicit" style, which Supabase also uses for reset emails sent from
 * its own dashboard). The server never sees anything after a `#`, so only the
 * browser can spot it, sign the person in for the reset, and steer them to the
 * "Choose a new password" form instead of leaving them inside the app.
 *
 * It does nothing at all unless the address actually carries a recovery token,
 * so ordinary page loads pay no cost.
 */
export function RecoveryLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=") || !/[#&]type=recovery(&|$)/.test(hash)) {
      return;
    }

    // Creating the client makes it read the token from the address and start
    // the session; we just wait for it to say so, then go to the form.
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        router.replace("/auth/update-password");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  return null;
}
