"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACCEPTED_MIME_TYPES,
  DIRECT_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  STORAGE_BUCKET,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { Icon, Spinner } from "@/components/ui";

type ItemState = "uploading" | "reading" | "done" | "duplicate" | "error";

interface UploadItem {
  name: string;
  state: ItemState;
  message?: string;
  expenseId?: string | null;
}

const DOT: Record<ItemState, string> = {
  uploading: "bg-zinc-300",
  reading: "animate-pulse bg-blue-500",
  done: "bg-emerald-500",
  duplicate: "bg-amber-500",
  error: "bg-red-500",
};

interface ApiReply {
  error?: string;
  duplicate?: boolean;
  resumed?: boolean;
  jobStatus?: string;
  expenseId?: string | null;
}

interface Sent {
  ok: boolean;
  status: number;
  data: ApiReply | null;
}

const DIRECT_TYPES: readonly string[] = DIRECT_UPLOAD_MIME_TYPES;

async function postJson(url: string, payload: unknown): Promise<Sent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => null)) as ApiReply | null;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Images and PDFs go straight from the browser to storage (no size cap from the
 * app host); the server then inspects the stored file. A file whose type the
 * browser can't report goes the classic way through the app server.
 */
async function sendFile(file: File, onReading: () => void): Promise<Sent> {
  if (DIRECT_TYPES.includes(file.type)) {
    const slip = await postJson("/api/documents/upload-url", {
      filename: file.name,
      type: file.type,
      size: file.size,
    });
    const token =
      (slip.data as { token?: string; path?: string } | null) ?? null;
    if (!slip.ok || !token?.token || !token.path) return slip;

    // Re-wrap so the declared type sticks (some browsers report "" or a
    // different type); no data is copied.
    const body = new Blob([file], { type: file.type });
    const { error } = await createClient()
      .storage.from(STORAGE_BUCKET)
      .uploadToSignedUrl(token.path, token.token, body, {
        contentType: file.type,
      });
    if (error) {
      return {
        ok: false,
        status: 502,
        data: { error: "Upload failed. Check your connection and try again." },
      };
    }
    // The file is safe in storage; from here the wait is the AI reading it.
    onReading();
    return postJson("/api/documents/finalize", {
      path: token.path,
      filename: file.name,
    });
  }

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/documents", { method: "POST", body: form });
  // A gateway error page (e.g. 413 from the host) is not JSON — don't crash on it.
  const data = (await res.json().catch(() => null)) as ApiReply | null;
  return { ok: res.ok, status: res.status, data };
}

/** Live "reading" note: the AI can take a minute when Google is busy, so say so. */
function ReadingNote() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
      <Spinner className="size-3" />
      Reading the document… {seconds}s
      {seconds >= 15 ? " (the AI is busy — still trying)" : ""}
    </span>
  );
}

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  const uploadOne = useCallback(
    async (file: File, onReading: () => void): Promise<UploadItem> => {
      // UX-only pre-checks; the server re-validates everything.
      if (file.size === 0) {
        return {
          name: file.name,
          state: "error",
          message: "That file is empty.",
        };
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return {
          name: file.name,
          state: "error",
          message: "File is larger than 25 MB.",
        };
      }

      try {
        const { ok, status, data } = await sendFile(file, onReading);
        if (!ok || !data) {
          return {
            name: file.name,
            state: "error",
            message:
              data?.error ??
              (status === 413
                ? "File is too large to upload."
                : `Upload failed (${status}). Please try again.`),
          };
        }
        if (data.duplicate && !data.resumed) {
          return {
            name: file.name,
            state: "duplicate",
            message: "Already uploaded earlier.",
            expenseId: data.expenseId,
          };
        }
        if (data.jobStatus === "busy") {
          return {
            name: file.name,
            state: "error",
            message:
              "Already being processed — check the list below in a moment.",
          };
        }
        if (data.jobStatus === "error") {
          return {
            name: file.name,
            state: "error",
            message:
              data.error ??
              "Extraction failed — press Retry in the list below.",
          };
        }
        return {
          name: file.name,
          state: "done",
          message: "Extracted — ready for review.",
          expenseId: data.expenseId,
        };
      } catch {
        return {
          name: file.name,
          state: "error",
          message: "Network problem — check your connection and try again.",
        };
      }
    },
    [],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      setBusy(true);
      setItems(
        files.map((f) => ({ name: f.name, state: "uploading" as const })),
      );

      for (let i = 0; i < files.length; i++) {
        const result = await uploadOne(files[i], () =>
          setItems((prev) =>
            prev.map((it, idx) =>
              idx === i ? { name: it.name, state: "reading" } : it,
            ),
          ),
        );
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
          {busy ? (
            <Spinner className="size-5" />
          ) : (
            <Icon name="upload" className="size-5" />
          )}
        </span>
        <p className="text-sm font-medium">
          {busy
            ? "Working on your files…"
            : "Drop invoices here, or tap to choose"}
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
                <span
                  className={`size-2 shrink-0 rounded-full ${DOT[it.state]}`}
                />
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
                  {it.state === "reading" ? (
                    <ReadingNote />
                  ) : (
                    (it.message ??
                    (it.state === "uploading" ? "Uploading…" : it.state))
                  )}
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
