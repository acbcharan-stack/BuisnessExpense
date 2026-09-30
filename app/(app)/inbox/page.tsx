import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, Icon, Spinner } from "@/components/ui";
import { RECORD_TYPE_LABELS_SHORT } from "@/lib/types";
import { APP_NAME } from "@/lib/constants";
import { friendlyStoredError } from "@/lib/gemini/errors";
import { UploadDropzone } from "./upload-dropzone";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: `Inbox · ${APP_NAME}` };
export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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

  // Which uploads already have a record to review? (documents -> expenses)
  const documentIds = (documents ?? []).map((d) => d.id);
  const { data: linked } = documentIds.length
    ? await supabase
        .from("expenses")
        .select("id, document_id")
        .in("document_id", documentIds)
    : { data: [] as { id: string; document_id: string | null }[] };
  const expenseByDocument = new Map(
    (linked ?? []).flatMap((e) => (e.document_id ? [[e.document_id, e.id] as const] : [])),
  );

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Upload documents, then review what the AI extracted."
      />

      <UploadDropzone />

      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <Link
        href="/records/new"
        className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm transition hover:border-blue-400 hover:bg-zinc-50 active:scale-[.99] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
      >
        <span className="flex items-center gap-2">
          <Icon name="plus" className="size-4 text-zinc-400" />
          Enter a receipt manually
          <span className="text-xs text-zinc-400">— no photo or AI scan</span>
        </span>
        <Icon name="chevronRight" className="size-4 text-zinc-300" />
      </Link>

      <section className="mt-8">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Icon name="clock" className="size-4 text-zinc-400" />
          Needs review
          <span className="rounded-full bg-zinc-200 px-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {toReview?.length ?? 0}
          </span>
        </h2>
        {!toReview || toReview.length === 0 ? (
          <Card className="p-4 text-sm text-zinc-500">
            Nothing waiting. Uploaded documents show up here once extracted.
          </Card>
        ) : (
          <Card className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {toReview.map((e) => (
              <Link
                key={e.id}
                href={`/records/${e.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition first:rounded-t-xl last:rounded-b-xl hover:bg-zinc-50 active:scale-[.995] dark:hover:bg-zinc-800/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge>{RECORD_TYPE_LABELS_SHORT[e.record_type]}</Badge>
                  <span className="truncate">
                    {e.invoice_number ?? "(no number)"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-zinc-500">
                    {e.total != null
                      ? `${e.currency} ${Number(e.total).toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                  <Icon name="chevronRight" className="size-4 text-zinc-300" />
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Icon name="file" className="size-4 text-zinc-400" />
          Recent uploads
        </h2>
        {!documents || documents.length === 0 ? (
          <Card className="p-4 text-sm text-zinc-500">No uploads yet.</Card>
        ) : (
          <Card className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {documents.map((d) => {
              const expenseId = expenseByDocument.get(d.id);
              const problem =
                d.status === "failed" || d.status === "uploaded"
                  ? friendlyStoredError(d.error)
                  : null;
              const name = d.original_filename?.trim() || "Untitled upload";
              const label = (
                <span className="block min-w-0 flex-1">
                  <span className="block truncate">{name}</span>
                  {d.status === "processing" ? (
                    <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                      <Spinner className="size-3" />
                      Reading the document — this can take up to a minute when
                      the AI is busy. Refresh to see the result.
                    </span>
                  ) : problem ? (
                    <span className="block break-words text-xs text-red-600 dark:text-red-400">
                      {problem}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">
                      {d.source} · {timeAgo(d.created_at)}
                    </span>
                  )}
                </span>
              );
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  {expenseId ? (
                    <Link
                      href={`/records/${expenseId}`}
                      className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge tone="status">{d.status}</Badge>
                    {expenseId ? (
                      <Link
                        href={`/records/${expenseId}`}
                        className="text-xs font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400"
                      >
                        Review
                      </Link>
                    ) : (
                      (d.status === "failed" || d.status === "uploaded") && (
                        <RetryButton documentId={d.id} />
                      )
                    )}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </>
  );
}
