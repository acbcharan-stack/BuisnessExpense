-- =============================================================================
-- Business Expense — 0003: multiple businesses (e.g. acb, boon)
-- Each record belongs to one of your businesses; each business has its own
-- GST identity for later export / GST logic.
-- =============================================================================

create table if not exists public.businesses (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  legal_name     text,
  gstin          text,
  gst_state_code text,
  address        text,
  is_archived    boolean not null default false,
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger businesses_touch
  before update on public.businesses
  for each row execute function public.touch_updated_at();

alter table public.businesses enable row level security;

-- Everyone on the team can see the business list; only managers change it.
create policy businesses_select on public.businesses
  for select to authenticated using (true);
create policy businesses_insert on public.businesses
  for insert to authenticated with check (public.can_manage());
create policy businesses_update on public.businesses
  for update to authenticated using (public.can_manage())
  with check (public.can_manage());
-- No delete policy — archive instead.

insert into public.businesses (name, sort) values ('acb', 0), ('boon', 1)
on conflict (name) do nothing;

-- Which business a record belongs to (nullable: existing rows start unassigned).
alter table public.expenses
  add column if not exists business_id uuid
    references public.businesses (id) on delete set null;

create index if not exists expenses_business_idx
  on public.expenses (business_id);
