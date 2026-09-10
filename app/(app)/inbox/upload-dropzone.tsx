"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_MIME_TYPES } from "@/lib/constants";
import { Icon, Spinner } from "@/components/ui";

type ItemState = "uploading" | "done" | "duplicate" | "error";

interface UploadItem {
  name: string;
  state: ItemState;
  message?: string;
  expenseId?: string | null;
}

const DOT: Record<ItemState, string> = {
  uploading: "bg-zinc-300",
  done: "bg-emerald-500",
  duplicate: "bg-amber-500",
  error: "bg-red-500",
};

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  const uploadOne = useCallback(async (file: File): Promise<UploadItem> => {
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/documents", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        duplicate?: boolean;
        jobStatus?: string;
        expenseId?: string | null;
      };
      if (!res.ok) {
        return {
          name: file.name,
          state: "error",
          message: data.error ?? res.statusText,
        };
      }
      if (data.duplicate) {
        return {
          name: file.name,
          state: "duplicate",
          message: "Already uploaded earlier.",
          expenseId: data.expenseId,
        };
      }
      if (data.jobStatus === "error") {
        return {
          name: file.name,
          state: "error",
          message: data.error ?? "Extraction failed — retry from the list below.",
        };
      }
      return {
        name: file.name,
        state: "done",
        message: "Extracted — ready for review.",
        expenseId: data.expenseId,
      };
    } catch (err) {
      return {
        name: file.name,
        state: "error",
        message: err instanceof Error ? err.message : "Network error",
      };
    }
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      setBusy(true);
      setItems(files.map((f) => ({ name: f.name, state: "uploading" as const })));

      for (let i = 0; i < files.length; i++) {
        const result = await uploadOne(files[i]);
        setItems((prev) => prev.map((it, idx) => (idx === i ? result : it)));
      }
      setBusy(false);
      router.refresh();
    },
    [router, uploadOne],
  );

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-zinc-300 bg-white hover:border-blue-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
        }`}
      >
        <span className="mb-3 grid size-11 place-items-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
          {busy ? <Spinner className="size-5" /> : <Icon name="upload" className="size-5" />}
        </span>
        <p className="text-sm font-medium">
          {busy ? "Uploading…" : "Drop invoices here, or tap to choose"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          JPG, PNG, WebP or PDF · up to 25 MB each · multiple files OK
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${DOT[it.state]}`} />
                <span className="truncate">{it.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <span
                  className={
                    it.state === "error"
                      ? "text-red-600"
                      : it.state === "done"
                        ? "text-emerald-600"
                        : it.state === "duplicate"
                          ? "text-amber-600"
                          : "text-zinc-500"
                  }
                >
                  {it.message ??
                    (it.state === "uploading" ? "Uploading…" : it.state)}
                </span>
                {it.expenseId && (
                  <a
                    href={`/records/${it.expenseId}`}
                    className="font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400"
                  >
                    Review
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
