import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { UploadDropzone } from "./upload-dropzone";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Inbox · Invoice Scanner" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createClient();

  const [{ data: toReview }, { data: documents }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, record_type, invoice_number, total, currency, created_at")
      .eq("status", "review")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("documents")
      .select("id, original_filename, source, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Upload documents, then review what Gemini extracted."
      />

      <UploadDropzone />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">
          Needs review{" "}
          <span className="text-zinc-400">({toReview?.length ?? 0})</span>
        </h2>
        {!toReview || toReview.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            Nothing waiting. Uploaded documents show up here once extracted.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {toReview.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/records/${e.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {e.record_type}
                    </span>{" "}
                    {e.invoice_number ?? "(no number)"}
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {e.total != null
                      ? `${e.currency} ${Number(e.total).toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Recent uploads</h2>
        {!documents || documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            No uploads yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0 truncate">
                  {d.original_filename ?? d.id}
                  {d.status === "failed" && d.error ? (
                    <span className="block truncate text-xs text-red-600">
                      {d.error}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                  <span>
                    {d.source} · {d.status}
                  </span>
                  {(d.status === "failed" || d.status === "uploaded") && (
                    <RetryButton documentId={d.id} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
