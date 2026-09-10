"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@/components/ui";
import { deleteRecord } from "@/app/(app)/records/[id]/actions";

/**
 * Deletes one record after an explicit "permanent" confirm. Shown only where
 * the caller has already checked the viewer is an owner/accountant — the
 * server action re-checks the role and the id regardless.
 */
export function DeleteRecordButton({
  recordId,
  label,
  srLabel,
  redirectTo,
}: {
  recordId: string;
  /** Optional visible text next to the icon (list rows are icon-only). */
  label?: string;
  /** Screen-reader description, e.g. the invoice number. */
  srLabel?: string;
  /** Where to go after a successful delete (default: refresh in place). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function doDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteRecord(recordId);
      if (!res.ok) {
        setError(res.error ?? "Delete failed.");
        setConfirming(false);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs dark:border-red-900/60 dark:bg-red-950/40">
        <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300">
          <Icon name="alert" className="size-3.5" />
          Delete permanently? This can&apos;t be undone.
        </span>
        <span className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="danger"
            loading={pending}
            onClick={doDelete}
          >
            Yes, delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        aria-label={`Delete ${srLabel ?? label ?? "record"} permanently`}
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-red-50 hover:text-red-600 active:scale-95 dark:hover:bg-red-950/40 dark:hover:text-red-400"
      >
        <Icon name="trash" className="size-4" />
        {label}
      </button>
    </span>
  );
}
