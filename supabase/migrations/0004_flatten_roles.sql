-- =============================================================================
-- 0004 — Flatten roles: one access level for everyone
-- =============================================================================
-- The team is small and fully trusted. Drop the owner / accountant / staff
-- split: every signed-in user can now do everything (upload, edit, confirm,
-- export, delete, settings). `profiles.role` becomes a plain 1..4 number that
-- is just an organisational label — it no longer gates anything.
--
-- Safe to run after 0001-0003. RLS policies are unchanged; only the two gate
-- functions they call are rewritten.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles.role : user_role enum  ->  smallint 1..4 (default 1)
-- ---------------------------------------------------------------------------
alter table public.profiles alter column role drop default;

alter table public.profiles
  alter column role type smallint using 1;      -- every existing user -> level 1

alter table public.profiles alter column role set default 1;

alter table public.profiles
  add constraint profiles_role_range check (role between 1 and 4);

-- The enum type is now unused.
drop type if exists public.user_role;

-- ---------------------------------------------------------------------------
-- Gate functions: "can this request write / manage?" -> "is it a signed-in
-- user with a profile row?". `current_role_name()` is SECURITY DEFINER and
-- returns the role (now '1'..'4') for auth.uid(), or NULL when there is no
-- profile — so `is not null` means "authenticated team member".
-- ---------------------------------------------------------------------------
create or replace function public.can_write()
returns boolean
language sql
stable
as $$
  select public.current_role_name() is not null;
$$;

create or replace function public.can_manage()
returns boolean
language sql
stable
as $$
  select public.current_role_name() is not null;
$$;

-- `handle_new_user()` already inserts only (id, full_name); the new column
-- default (1) applies to every new account, so it needs no change.
