"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RetryButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/documents/${documentId}/retry`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Retry failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
    </span>
  );
}
