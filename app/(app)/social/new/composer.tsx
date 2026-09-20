"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Icon, Spinner } from "@/components/ui";
import { SOCIAL_BUCKET } from "@/lib/constants";
import {
  SOCIAL_ACCEPT,
  SOCIAL_CAPTION_MAX,
  SOCIAL_MAX_FILES,
  SOCIAL_MAX_FILE_BYTES,
  SOCIAL_TITLE_MAX,
  checkSocialFile,
  formatBytes,
  mimeForFile,
  socialKindFor,
} from "@/lib/social";
import {
  abandonSocialUpload,
  prepareSocialUpload,
  publishSocialPost,
} from "../actions";

type FileState = "ready" | "uploading" | "done" | "error";

interface Picked {
  key: string;
  file: File;
  mime: string;
  previewUrl: string;
  state: FileState;
}

/** A refusal we want the person to read as-is (safe, plain-language text). */
class UploadFailure extends Error {}

/**
 * Time allowed for one file: 2 minutes plus the time it would take at a very
 * slow ~64 KB/s, capped at 20 minutes. Generous for real slow connections, but
 * a stalled upload can't hang the page for ever.
 */
function uploadTimeoutMs(bytes: number): number {
  const seconds = 120 + bytes / (64 * 1024);
  return Math.min(seconds, 20 * 60) * 1000;
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UploadFailure(message)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-900";

export function PostComposer() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Free the in-browser preview addresses when the page is left.
  const pickedRef = useRef<Picked[]>([]);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  useEffect(
    () => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)),
    [],
  );

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    if (incoming.length === 0) return;

    const notes: string[] = [];
    const accepted: Picked[] = [];
    let room = SOCIAL_MAX_FILES - picked.length;

    for (const file of incoming) {
      const problem = checkSocialFile(file);
      if (problem) {
        notes.push(problem);
        continue;
      }
      if (room <= 0) {
        notes.push(`${file.name}: a post can have at most ${SOCIAL_MAX_FILES} files.`);
        continue;
      }
      room--;
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        mime: mimeForFile(file),
        previewUrl: URL.createObjectURL(file),
        state: "ready",
      });
    }
    setProblems(notes);
    if (accepted.length > 0) setPicked((prev) => [...prev, ...accepted]);
  }

  function removeFile(key: string) {
    setPicked((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  const setState = (key: string, state: FileState) =>
    setPicked((prev) => prev.map((p) => (p.key === key ? { ...p, state } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!title.trim()) {
      setError("Give the post a title.");
      return;
    }
    if (picked.length === 0) {
      setError("Add at least one photo or video.");
      return;
    }

    setBusy(true);
    setStatus("Getting ready…");
    setPicked((prev) => prev.map((p) => ({ ...p, state: "ready" })));

    // Whatever goes wrong below — a refused step, a dropped connection, a
    // stalled upload — we always land in `finally`, so the button can never
    // be left spinning for ever.
    let postId: string | null = null;
    let published = false;
    let failedKey: string | null = null;
    let step = "getting ready";
    try {
      // 1. Ask the server for one upload slip per file.
      step = "asking the server for upload permission";
      const prep = await prepareSocialUpload({
        files: picked.map((p) => ({ type: p.mime, size: p.file.size })),
      });
      if (!prep.ok) throw new UploadFailure(prep.error);
      postId = prep.postId;

      // 2. Send the files straight to storage (videos are too big to go through
      //    the app server), one after the other.
      const supabase = createClient();
      for (let i = 0; i < picked.length; i++) {
        const p = picked[i];
        const slip = prep.uploads[i];
        setState(p.key, "uploading");
        step = `uploading ${p.file.name}`;
        setStatus(
          `Uploading file ${i + 1} of ${picked.length} (${formatBytes(p.file.size)})` +
            " — large videos can take a few minutes.",
        );
        // The storage library sends a picked file under the file's OWN type
        // and ignores `contentType`; some browsers report "" for .mov/.mp4.
        // Re-wrapping (no data is copied) makes the declared type stick.
        const body = new Blob([p.file], { type: p.mime });
        const { error: upErr } = await withTimeout(
          supabase.storage
            .from(SOCIAL_BUCKET)
            .uploadToSignedUrl(slip.path, slip.token, body, {
              contentType: p.mime,
            }),
          uploadTimeoutMs(p.file.size),
          `Upload of ${p.file.name} took too long and was stopped. Check your connection and try again.`,
        ).catch((err: unknown) => {
          failedKey = p.key;
          throw err;
        });
        if (upErr) {
          failedKey = p.key;
          throw new UploadFailure(
            `Upload of ${p.file.name} failed. Nothing was posted — please try again.`,
          );
        }
        setState(p.key, "done");
      }

      // 3. Publish the post.
      step = "publishing the post";
      setStatus("Publishing…");
      const res = await publishSocialPost({
        postId: prep.postId,
        title,
        caption,
        files: prep.uploads.map((u, i) => ({
          name: u.name,
          original_name: picked[i].file.name,
        })),
      });
      if (!res.ok || !res.id) {
        throw new UploadFailure(res.error ?? "Could not create the post.");
      }
      published = true;
      router.push(`/social/${res.id}`);
      router.refresh();
    } catch (err) {
      console.error("Social post failed while", step, err);
      // Name the step and the error so a failure can be diagnosed from a
      // screenshot (browser-side errors carry no secrets).
      const detail = err instanceof Error && err.message ? err.message : "unknown error";
      setError(
        err instanceof UploadFailure
          ? err.message
          : `Something went wrong while ${step}, and nothing was posted. (${detail})`,
      );
    } finally {
      if (!published) {
        // Tidy any half-uploaded files (the server only ever removes a folder
        // whose post does not exist), then hand the form back.
        if (postId) await abandonSocialUpload(postId).catch(() => undefined);
        setPicked((prev) =>
          prev.map((p) => ({ ...p, state: p.key === failedKey ? "error" : "ready" })),
        );
        setStatus(null);
        setBusy(false);
      }
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <Card className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Title
          </span>
          <input
            className={inputCls}
            value={title}
            maxLength={SOCIAL_TITLE_MAX}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New 5-axis machine — launch post"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Caption / notes <span className="font-normal">(optional)</span>
          </span>
          <textarea
            className={`${inputCls} min-h-24`}
            value={caption}
            maxLength={SOCIAL_CAPTION_MAX}
            disabled={busy}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What is this post about? Any hashtags or timing?"
          />
        </label>
      </Card>

      <div className="space-y-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose photos or videos"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!busy && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : "border-zinc-300 bg-white hover:border-blue-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <span className="mb-3 grid size-11 place-items-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <Icon name="upload" className="size-5" />
          </span>
          <p className="text-sm font-medium">
            Drop photos and videos here, or tap to choose
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            JPG, PNG, WebP, GIF, MP4, WebM or MOV · any size or shape · up to{" "}
            {SOCIAL_MAX_FILE_BYTES / (1024 * 1024)} MB each · up to{" "}
            {SOCIAL_MAX_FILES} files
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={SOCIAL_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = ""; // allow picking the same file again
            }}
          />
        </div>

        {problems.length > 0 && (
          <ul className="space-y-1 text-sm text-red-600" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        {picked.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {picked.map((p) => {
              const kind = socialKindFor(p.mime);
              return (
                <li
                  key={p.key}
                  className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-950">
                    {kind === "video" ? (
                      <video
                        src={`${p.previewUrl}#t=0.1`}
                        preload="metadata"
                        muted
                        playsInline
                        className="size-full object-contain"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.previewUrl}
                        alt={p.file.name}
                        className="size-full object-contain"
                      />
                    )}
                    {p.state === "uploading" && (
                      <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                        <Spinner className="size-6" />
                      </span>
                    )}
                    {p.state === "done" && (
                      <span className="absolute inset-0 grid place-items-center bg-emerald-600/40 text-white">
                        <Icon name="check" className="size-6" />
                      </span>
                    )}
                    {p.state === "error" && (
                      <span className="absolute inset-0 grid place-items-center bg-red-600/50 text-white">
                        <Icon name="alert" className="size-6" />
                      </span>
                    )}
                    {!busy && (
                      <button
                        type="button"
                        aria-label={`Remove ${p.file.name}`}
                        onClick={() => removeFile(p.key)}
                        className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 active:scale-90"
                      >
                        <Icon name="x" className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="p-2 text-xs">
                    <p className="truncate font-medium" title={p.file.name}>
                      {p.file.name}
                    </p>
                    <p className="text-zinc-500">
                      {kind === "video" ? "Video" : "Photo"} ·{" "}
                      {formatBytes(p.file.size)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" icon="check" loading={busy}>
          {busy ? "Uploading…" : "Publish post"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => router.push("/social")}
        >
          Cancel
        </Button>
        {busy && (
          <span className="text-xs text-zinc-500" role="status">
            {status ?? "Working…"} Keep this page open until it finishes.
          </span>
        )}
      </div>
    </form>
  );
}
