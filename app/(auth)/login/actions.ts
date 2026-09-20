"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export interface AuthActionState {
  error?: string;
  notice?: string;
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Incorrect email or password." };
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function sendPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email first." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.siteUrl}/auth/reset`,
  });
  if (error) {
    // Never log the address itself; the code + status are enough to diagnose.
    console.error("Password reset email failed:", error.status, error.code, error.message);

    // These two say something about the email SERVICE, not about whether the
    // address has an account, so they are safe to show and stop the person
    // waiting for a mail that will never come.
    if (error.code === "over_email_send_rate_limit") {
      return {
        error:
          "Too many emails have been sent recently. Wait a while (up to an hour) and try again.",
      };
    }
    if (error.code === "email_address_not_authorized") {
      return {
        error:
          "The email service isn't allowed to send to this address yet. Ask the administrator to set up email sending (custom SMTP) in Supabase.",
      };
    }
  }
  // Otherwise always report success — don't reveal whether an address is registered.
  return {
    notice: "If that address has an account, a reset link is on its way.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
