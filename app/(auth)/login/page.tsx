import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Icon } from "@/components/ui";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: `Sign in · ${APP_NAME}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

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
