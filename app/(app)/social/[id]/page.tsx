import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge, Card, Icon } from "@/components/ui";
import { APP_NAME } from "@/lib/constants";
import { isUuid } from "@/lib/uuid";
import {
  FORMER_AUTHOR,
  formatWhen,
  loadAuthorNames,
  signSocialUrls,
} from "../data";
import {
  CommentForm,
  DeleteCommentButton,
  DeletePostButton,
} from "./controls";

export const metadata: Metadata = { title: `Post · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function SocialPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("social_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const [{ data: media }, { data: comments }] = await Promise.all([
    supabase
      .from("social_post_media")
      .select("*")
      .eq("post_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("social_post_comments")
      .select("*")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
  ]);
  const files = media ?? [];
  const thread = comments ?? [];

  const paths = files.map((m) => m.storage_path);
  const [viewUrls, downloadUrls, authors] = await Promise.all([
    signSocialUrls(supabase, paths),
    signSocialUrls(supabase, paths, true),
    loadAuthorNames(supabase, [post.author_id, ...thread.map((c) => c.author_id)]),
  ]);

  const nameOf = (authorId: string | null) =>
    (authorId && authors.get(authorId)) || FORMER_AUTHOR;
  const isPostAuthor = post.author_id === profile.id;

  return (
    <>
      <PageHeader
        title={post.title}
        description={`${nameOf(post.author_id)} · ${formatWhen(post.created_at)}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/social"
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← All posts
            </Link>
            {isPostAuthor && <DeletePostButton postId={post.id} />}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-label="Photos and videos" className="space-y-4">
          {post.caption && (
            <Card className="p-4">
              <p className="whitespace-pre-wrap break-words text-sm">
                {post.caption}
              </p>
            </Card>
          )}

          {files.length === 0 && (
            <EmptyState icon="image">This post has no files.</EmptyState>
          )}

          {files.map((m, i) => {
            const url = viewUrls.get(m.storage_path);
            const dl = downloadUrls.get(m.storage_path);
            return (
              <Card key={m.id} className="overflow-hidden">
                <div className="flex justify-center bg-zinc-100 dark:bg-zinc-950">
                  {url && m.kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={m.original_name || `${post.title} — file ${i + 1}`}
                      loading={i === 0 ? "eager" : "lazy"}
                      className="max-h-[80vh] w-auto max-w-full object-contain"
                    />
                  )}
                  {url && m.kind === "video" && (
                    <video
                      src={url}
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={m.original_name || `${post.title} — video ${i + 1}`}
                      className="max-h-[80vh] w-auto max-w-full"
                    />
                  )}
                  {!url && (
                    <p className="p-10 text-sm text-zinc-500">
                      This file couldn&apos;t be loaded. Refresh the page.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-zinc-500">
                  <span className="min-w-0 truncate" title={m.original_name ?? ""}>
                    {m.kind === "video" ? "Video" : "Photo"} {i + 1} of{" "}
                    {files.length}
                    {m.original_name ? ` · ${m.original_name}` : ""}
                  </span>
                  {dl && (
                    <a
                      href={dl}
                      className="shrink-0 font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Download
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </section>

        <section aria-label="Comments and suggestions" className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="message" className="size-4" />
            Comments &amp; suggestions
            <span className="font-normal text-zinc-400">({thread.length})</span>
          </h2>

          {thread.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No comments yet. Be the first to share feedback.
            </p>
          ) : (
            <ul className="space-y-3">
              {thread.map((c) => {
                const canDelete = c.author_id === profile.id || isPostAuthor;
                return (
                  <li key={c.id}>
                    <Card
                      className={`p-3 ${
                        c.kind === "suggestion"
                          ? "border-amber-300 dark:border-amber-800/70"
                          : ""
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-medium">{nameOf(c.author_id)}</span>
                        {c.kind === "suggestion" && (
                          <Badge className="!bg-amber-100 !text-amber-700 dark:!bg-amber-950/50 dark:!text-amber-300">
                            Suggested change
                          </Badge>
                        )}
                        <span className="text-zinc-500">
                          {formatWhen(c.created_at)}
                        </span>
                        {canDelete && (
                          <span className="ml-auto">
                            <DeleteCommentButton commentId={c.id} />
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {c.body}
                      </p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <Card className="p-3">
            <CommentForm postId={post.id} />
          </Card>
        </section>
      </div>
    </>
  );
}
