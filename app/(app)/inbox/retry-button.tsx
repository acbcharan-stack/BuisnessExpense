"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RetryButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/retry`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok || data?.error) {
          setError(data?.error ?? "Retry failed. Please try again.");
        }
      } catch {
        setError("Network problem — please try again.");
      }
      // Refresh either way: a failed retry also updates the saved message.
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="max-w-56 text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
      <Button
        size="sm"
        variant="secondary"
        icon="refresh"
        loading={pending}
        onClick={retry}
      >
        Retry
      </Button>
    </span>
  );
}
