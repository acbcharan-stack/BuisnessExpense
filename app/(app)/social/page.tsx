import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge, Card, Icon } from "@/components/ui";
import { ListPager } from "@/components/list-pager";
import { APP_NAME } from "@/lib/constants";
import type { SocialPostMediaRow } from "@/lib/supabase/database.types";
import { MAX_PAGE_NUMBER, parsePageParam } from "@/lib/pagination";
import { SOCIAL_PAGE_SIZE } from "@/lib/social";
import {
  FORMER_AUTHOR,
  formatWhen,
  loadAuthorNames,
  signSocialUrls,
} from "./data";

export const metadata: Metadata = {
  title: `Social Media Posts & Videos · ${APP_NAME}`,
};
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SocialFeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [sp] = await Promise.all([searchParams, requireProfile()]);
  const supabase = await createClient();

  const page = Math.min(parsePageParam(sp.page), MAX_PAGE_NUMBER);
  const from = (page - 1) * SOCIAL_PAGE_SIZE;
  const to = from + SOCIAL_PAGE_SIZE - 1;

  const { data: posts, count } = await supabase
    .from("social_posts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SOCIAL_PAGE_SIZE));
  const rows = posts ?? [];

  const postIds = rows.map((p) => p.id);
  const [{ data: media }, { data: comments }, authors] = await Promise.all([
    postIds.length
      ? supabase
          .from("social_post_media")
          .select("*")
          .in("post_id", postIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabase
          .from("social_post_comments")
          .select("post_id, kind")
          .in("post_id", postIds)
      : Promise.resolve({ data: [] }),
    loadAuthorNames(
      supabase,
      rows.map((p) => p.author_id),
    ),
  ]);

  const mediaByPost = new Map<string, SocialPostMediaRow[]>();
  for (const m of media ?? []) {
    const list = mediaByPost.get(m.post_id) ?? [];
    list.push(m);
    mediaByPost.set(m.post_id, list);
  }
  const counts = new Map<string, { comments: number; suggestions: number }>();
  for (const c of comments ?? []) {
    const cur = counts.get(c.post_id) ?? { comments: 0, suggestions: 0 };
    if (c.kind === "suggestion") cur.suggestions++;
    else cur.comments++;
    counts.set(c.post_id, cur);
  }

  // Only the cover file of each post is needed on this page.
  const covers = rows
    .map((p) => mediaByPost.get(p.id)?.[0])
    .filter((m): m is SocialPostMediaRow => !!m);
  const urls = await signSocialUrls(
    supabase,
    covers.map((m) => m.storage_path),
  );

  const newPostButton = (
    <Link
      href="/social/new"
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 active:scale-[.97] dark:bg-blue-500 dark:hover:bg-blue-400"
    >
      <Icon name="plus" className="size-[18px]" />
      New post
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Social Media Posts & Videos"
        description="Share photos and videos for upcoming posts. Teammates can comment and suggest changes."
        action={newPostButton}
      />

      {rows.length === 0 ? (
        page > 1 ? (
          <EmptyState icon="image">
            Nothing on this page anymore.{" "}
            <Link href="/social" className="text-blue-600 hover:underline">
              Back to the first page
            </Link>
          </EmptyState>
        ) : (
          <EmptyState icon="image">
            No posts yet. Use “New post” to upload the first photo or video.
          </EmptyState>
        )
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((post) => {
              const files = mediaByPost.get(post.id) ?? [];
              const cover = files[0];
              const coverUrl = cover ? urls.get(cover.storage_path) : undefined;
              const c = counts.get(post.id) ?? { comments: 0, suggestions: 0 };
              const author =
                (post.author_id && authors.get(post.author_id)) || FORMER_AUTHOR;
              return (
                <li key={post.id}>
                  <Link
                    href={`/social/${post.id}`}
                    className="group block h-full focus-visible:outline-none"
                  >
                    <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-blue-300 group-focus-visible:ring-2 group-focus-visible:ring-blue-500/60 dark:group-hover:border-blue-800">
                      <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-950">
                        {coverUrl && cover?.kind === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coverUrl}
                            alt={post.title}
                            loading="lazy"
                            className="size-full object-contain"
                          />
                        )}
                        {coverUrl && cover?.kind === "video" && (
                          <>
                            <video
                              src={`${coverUrl}#t=0.1`}
                              preload="metadata"
                              muted
                              playsInline
                              aria-label={post.title}
                              className="size-full object-contain"
                            />
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                              <Icon name="video" className="size-3.5" />
                              Video
                            </span>
                          </>
                        )}
                        {!coverUrl && (
                          <span className="grid size-full place-items-center text-zinc-400">
                            <Icon name="image" className="size-8" />
                          </span>
                        )}
                        {files.length > 1 && (
                          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                            {files.length} files
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <h2 className="line-clamp-2 text-sm font-semibold">
                          {post.title}
                        </h2>
                        {post.caption && (
                          <p className="line-clamp-2 text-xs text-zinc-500">
                            {post.caption}
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-zinc-500">
                          <span>
                            {author} · {formatWhen(post.created_at)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Badge>
                            {c.comments} comment{c.comments === 1 ? "" : "s"}
                          </Badge>
                          {c.suggestions > 0 && (
                            <Badge className="!bg-amber-100 !text-amber-700 dark:!bg-amber-950/50 dark:!text-amber-300">
                              {c.suggestions} suggestion
                              {c.suggestions === 1 ? "" : "s"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
          <ListPager page={page} pageCount={pageCount} total={total} noun="post" />
        </>
      )}
    </>
  );
}
