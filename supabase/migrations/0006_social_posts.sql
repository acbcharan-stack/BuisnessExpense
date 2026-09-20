-- =============================================================================
-- 0006 — Social media posts & videos
-- =============================================================================
-- A shared board where anyone on the team can post photos / videos (several
-- files per post, any dimensions) and everyone else can comment or suggest
-- changes. Purely additive: new tables + one new private storage bucket.
-- Safe to run after 0001-0005. Run it ONCE.
--
-- Who can do what:
--   * read      — every signed-in team member (has a profile)
--   * post      — any team member; a post can only be created as yourself
--   * edit/delete a post — its author only
--   * comment   — any team member; a comment can only be written as yourself
--   * delete a comment — the comment's author, or the post's author
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Posts
-- -----------------------------------------------------------------------------
create table public.social_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references public.profiles (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  caption     text check (caption is null or char_length(caption) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index social_posts_created_idx on public.social_posts (created_at desc);

create trigger social_posts_touch
  before update on public.social_posts
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Media files belonging to a post (a post can hold several)
-- -----------------------------------------------------------------------------
create table public.social_post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.social_posts (id) on delete cascade,
  position      int  not null default 0,
  storage_path  text not null unique,
  kind          text not null check (kind in ('image', 'video')),
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  original_name text,
  created_at    timestamptz not null default now()
);
create index social_post_media_post_idx on public.social_post_media (post_id, position);

-- -----------------------------------------------------------------------------
-- Comments and change suggestions
-- -----------------------------------------------------------------------------
create table public.social_post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.social_posts (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  kind        text not null default 'comment' check (kind in ('comment', 'suggestion')),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index social_post_comments_post_idx
  on public.social_post_comments (post_id, created_at);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.social_posts          enable row level security;
alter table public.social_post_media     enable row level security;
alter table public.social_post_comments  enable row level security;

create policy social_posts_select on public.social_posts
  for select to authenticated using (true);
create policy social_posts_insert on public.social_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_write());
create policy social_posts_update on public.social_posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy social_posts_delete on public.social_posts
  for delete to authenticated using (author_id = auth.uid());

create policy social_post_media_select on public.social_post_media
  for select to authenticated using (true);
create policy social_post_media_insert on public.social_post_media
  for insert to authenticated
  with check (
    public.can_write()
    and exists (
      select 1 from public.social_posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );
create policy social_post_media_delete on public.social_post_media
  for delete to authenticated
  using (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

create policy social_post_comments_select on public.social_post_comments
  for select to authenticated using (true);
create policy social_post_comments_insert on public.social_post_comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_write());
create policy social_post_comments_delete on public.social_post_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.social_posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Storage: private bucket. The bucket itself enforces the allowed file types
-- and a per-file size cap, no matter what the browser claims. Deleting files
-- is done only by the server (service role) after it checks the author, so
-- there is deliberately no delete policy for regular users.
--
-- NOTE: Supabase also has a project-wide upload cap (50 MB on the free plan,
-- raise it under Storage -> Settings on Pro). The smaller of the two applies.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media',
  'social-media',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "social media bucket read" on storage.objects
  for select to authenticated using (bucket_id = 'social-media');
create policy "social media bucket insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'social-media');
