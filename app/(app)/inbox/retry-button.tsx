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
