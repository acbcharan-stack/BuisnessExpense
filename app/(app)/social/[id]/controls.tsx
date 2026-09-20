"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@/components/ui";
import { SOCIAL_COMMENT_MAX } from "@/lib/social";
import {
  addSocialComment,
  deleteSocialComment,
  deleteSocialPost,
} from "../actions";

/** Write a comment, or suggest a change to the post. */
export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"comment" | "suggestion">("comment");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addSocialComment({ postId, kind, body });
      if (!res.ok) {
        setError(res.error ?? "Could not post.");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Type of message"
        className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
      >
        {(
          [
            ["comment", "Comment"],
            ["suggestion", "Suggest a change"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            disabled={pending}
            onClick={() => setKind(value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition active:scale-[.97] ${
              kind === value
                ? value === "suggestion"
                  ? "bg-amber-500 text-white"
                  : "bg-blue-600 text-white dark:bg-blue-500"
                : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        aria-label={kind === "suggestion" ? "Suggested change" : "Comment"}
        className="min-h-24 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        value={body}
        maxLength={SOCIAL_COMMENT_MAX}
        disabled={pending}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          kind === "suggestion"
            ? "What should be changed? e.g. crop the left side, shorten the caption…"
            : "Write a comment…"
        }
      />
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="sm"
        icon="message"
        loading={pending}
        disabled={body.trim() === ""}
      >
        {kind === "suggestion" ? "Send suggestion" : "Post comment"}
      </Button>
    </form>
  );
}

/** Two-step confirm before deleting; the server re-checks who you are. */
function ConfirmDelete({
  label,
  showLabel = false,
  confirmText,
  onDelete,
}: {
  label: string;
  /** Show the text next to the icon (otherwise icon-only). */
  showLabel?: boolean;
  confirmText: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await onDelete();
      if (!res.ok) {
        setError(res.error ?? "Delete failed.");
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs dark:border-red-900/60 dark:bg-red-950/40">
        <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300">
          <Icon name="alert" className="size-3.5" />
          {confirmText}
        </span>
        <Button size="sm" variant="danger" loading={pending} onClick={run}>
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
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        aria-label={label}
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-red-50 hover:text-red-600 active:scale-95 dark:hover:bg-red-950/40 dark:hover:text-red-400"
      >
        <Icon name="trash" className="size-4" />
        {showLabel ? label : null}
      </button>
    </span>
  );
}

export function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      label="Delete post"
      showLabel
      confirmText="Delete this post and its files? This can't be undone."
      onDelete={async () => {
        const res = await deleteSocialPost(postId);
        if (res.ok) {
          router.push("/social");
          router.refresh();
        }
        return res;
      }}
    />
  );
}

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      label="Delete comment"
      confirmText="Delete this comment?"
      onDelete={async () => {
        const res = await deleteSocialComment(commentId);
        if (res.ok) router.refresh();
        return res;
      }}
    />
  );
}
