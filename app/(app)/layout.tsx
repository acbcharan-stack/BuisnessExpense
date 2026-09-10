import { requireProfile } from "@/lib/supabase/auth";
import { AppNav } from "@/components/app-nav";
import { APP_NAME } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AppNav name={profile.full_name || "You"} role={profile.role} />
      <div className="flex min-h-dvh flex-col lg:pl-56">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400 dark:border-zinc-800 sm:px-6">
          {APP_NAME} · signed in as {profile.full_name || "you"} (level{" "}
          {profile.role})
        </footer>
      </div>
    </div>
  );
}
