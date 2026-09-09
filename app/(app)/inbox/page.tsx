import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";

export const metadata: Metadata = { title: "Inbox · Invoice Scanner" };

export default async function InboxPage() {
  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, original_filename, source, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Uploaded documents and their extraction status."
      />
      {!documents || documents.length === 0 ? (
        <EmptyState>
          Nothing here yet. Upload &amp; extraction land in Phase&nbsp;1.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="truncate">
                {d.original_filename ?? d.id}
              </span>
              <span className="ml-4 shrink-0 text-xs text-zinc-500">
                {d.source} · {d.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
