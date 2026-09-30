import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Icon } from "@/components/ui";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: `Sign in · ${APP_NAME}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; why?: string }>;
}) {
  const { next, reset, why } = await searchParams;
  // Only ever show a short plain label, never arbitrary text from the address.
  const reason = why && /^[A-Za-z0-9_]{1,60}$/.test(why) ? why : null;
  // A plain-language cause for the reasons we know how to explain.
  const reasonHelp =
    reason === "bad_code_verifier"
      ? "This link belongs to an older reset request. Only the newest email works, and a failed try uses it up. Request one new link, wait for that email, and open only it — in this same browser."
      : reason === "AuthPKCECodeVerifierMissingError"
        ? "This browser doesn't have the request that goes with the link — it was probably opened in a different browser, profile, or a mail app's built-in browser. Request a new link here and open it in this same browser."
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm dark:bg-blue-500">
            <Icon name="invoice" className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to capture and review expenses.
          </p>
        </div>
        {reset === "invalid" ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            That password-reset link didn&apos;t work — it may have expired, been
            used already, or been opened in a different browser than the one you
            requested it from. Request a new link below and open it in the same
            browser.
            {reasonHelp ? (
              <span className="mt-2 block font-medium">{reasonHelp}</span>
            ) : null}
            {reason ? (
              <span className="mt-1 block text-xs opacity-80">
                Reason code: {reason}
              </span>
            ) : null}
          </p>
        ) : null}
        <Suspense>
          <LoginForm next={next ?? "/dashboard"} />
        </Suspense>
        <p className="mt-6 text-center text-xs text-zinc-400">
          Internal tool · accounts are provisioned by your administrator.
        </p>
      </div>
    </main>
  );
}
