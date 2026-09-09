import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function UpdatePasswordPage() {
  // The reset route established a session before redirecting here.
  const user = await getCurrentUser();
  if (!user) redirect("/login?reset=invalid");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-lg font-semibold">
          Choose a new password
        </h1>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
