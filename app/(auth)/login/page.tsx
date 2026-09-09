import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Invoice Scanner" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Invoice&nbsp;Scanner
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to capture and review expenses.
          </p>
        </div>
        <Suspense>
          <LoginForm next={next ?? "/dashboard"} />
        </Suspense>
      </div>
    </main>
  );
}
