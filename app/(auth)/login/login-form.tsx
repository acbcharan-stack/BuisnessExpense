"use client";

import { useActionState } from "react";
import { Card, SubmitButton } from "@/components/ui";
import {
  sendPasswordReset,
  signIn,
  type AuthActionState,
} from "./actions";

const initial: AuthActionState = {};

const fieldCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signIn, initial);
  const [resetState, resetAction] = useActionState(sendPasswordReset, initial);

  return (
    <Card className="p-6">
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

        <SubmitButton variant="primary" block>
          Sign in
        </SubmitButton>
      </form>

      <form
        action={resetAction}
        className="mt-5 space-y-2 border-t border-zinc-200 pt-5 dark:border-zinc-800"
      >
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
          className={fieldCls}
        />
        <SubmitButton size="sm" variant="ghost">
          Send reset link
        </SubmitButton>
        {resetState.notice ? (
          <p className="text-sm text-emerald-600">{resetState.notice}</p>
        ) : null}
        {resetState.error ? (
          <p className="text-sm text-red-600">{resetState.error}</p>
        ) : null}
      </form>
    </Card>
  );
}
