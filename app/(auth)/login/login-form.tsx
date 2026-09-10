"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  sendPasswordReset,
  signIn,
  type AuthActionState,
} from "./actions";

const initial: AuthActionState = {};

const fieldCls =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      suppressHydrationWarning
      className="w-full rounded-md bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signIn, initial);
  const [resetState, resetAction] = useActionState(sendPasswordReset, initial);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            suppressHydrationWarning
            className={fieldCls}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            suppressHydrationWarning
            className={fieldCls}
          />
        </div>

        {state.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}

        <SubmitButton label="Sign in" pendingLabel="Signing in…" />
      </form>

      <form action={resetAction} className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          Forgot your password? Enter your email and we&apos;ll send a reset
          link.
        </p>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@example.com"
          suppressHydrationWarning
          className={`mt-2 ${fieldCls}`}
        />
        <button
          type="submit"
          suppressHydrationWarning
          className="mt-2 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          Send reset link
        </button>
        {resetState.notice ? (
          <p className="mt-2 text-sm text-emerald-600">{resetState.notice}</p>
        ) : null}
        {resetState.error ? (
          <p className="mt-2 text-sm text-red-600">{resetState.error}</p>
        ) : null}
      </form>
    </div>
  );
}
