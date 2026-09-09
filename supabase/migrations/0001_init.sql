-- =============================================================================
-- Invoice Scanner — initial schema
-- Engineering / CNC machine shop expense + invoice capture
-- =============================================================================

-- gen_random_uuid() is available via pgcrypto (enabled by default on Supabase).
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type user_role       as enum ('owner', 'accountant', 'staff');
create type record_type      as enum ('invoice', 'expense');
create type expense_type      as enum ('invoice', 'bill', 'receipt', 'utility', 'payroll');
create type document_source   as enum ('camera', 'upload', 'email');
create type document_status   as enum ('uploaded', 'processing', 'extracted', 'failed');
create type job_status        as enum ('queued', 'running', 'done', 'error');
create type expense_status    as enum ('review', 'confirmed', 'exported', 'archived');
create type tax_id_type       as enum ('GSTIN', 'VAT', 'EIN', 'OTHER');
create type tax_type          as enum ('CGST', 'SGST', 'IGST', 'CESS', 'VAT', 'GST', 'SALES_TAX', 'OTHER');

-- -----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        user_role not null default 'staff',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookup for the current request (SECURITY DEFINER to dodge RLS recursion).
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.can_write()
returns boolean
language sql
stable
as $$
  select public.current_role_name() in ('owner', 'accountant', 'staff');
$$;

create or replace function public.can_manage()
returns boolean
language sql
stable
as $$
  select public.current_role_name() in ('owner', 'accountant');
$$;

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  zoho_account_name   text,
  default_record_type record_type not null default 'expense',
  parent_id           uuid references public.categories (id) on delete set null,
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- vendors
-- -----------------------------------------------------------------------------
create table public.vendors (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  normalized_name      text not null,
  tax_id               text,
  tax_id_type          tax_id_type,
  country              text not null default 'IN',
  default_category_id  uuid references public.categories (id) on delete set null,
  zoho_vendor_name     text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (normalized_name, country)
);
create index vendors_normalized_name_idx on public.vendors (normalized_name);

-- -----------------------------------------------------------------------------
-- documents  (the raw uploaded file + processing status)
-- -----------------------------------------------------------------------------
create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  storage_path       text not null,
  original_filename  text,
  mime_type          text not null,
  size_bytes         bigint not null default 0,
  page_count         int,
  sha256             text,
  source             document_source not null default 'upload',
  sender_email       text,
  uploaded_by        uuid references public.profiles (id) on delete set null,
  status             document_status not null default 'uploaded',
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index documents_sha256_key on public.documents (sha256) where sha256 is not null;
create index documents_status_idx on public.documents (status);
create index documents_created_at_idx on public.documents (created_at desc);

-- -----------------------------------------------------------------------------
-- extraction_jobs
-- -----------------------------------------------------------------------------
create table public.extraction_jobs (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  status        job_status not null default 'queued',
  attempts      int not null default 0,
  last_error    text,
  gemini_model  text,
  raw_response  jsonb,
  scheduled_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index extraction_jobs_status_idx on public.extraction_jobs (status, scheduled_at);
create index extraction_jobs_document_idx on public.extraction_jobs (document_id);

-- -----------------------------------------------------------------------------
-- expenses  (one confirmed record per document; record_type splits the 2 tabs)
-- -----------------------------------------------------------------------------
create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents (id) on delete cascade,
  vendor_id        uuid references public.vendors (id) on delete set null,
  category_id      uuid references public.categories (id) on delete set null,
  record_type      record_type not null default 'expense',
  expense_type     expense_type,
  invoice_number   text,
  invoice_date     date,
  due_date         date,
  currency         text not null default 'INR',
  country          text not null default 'IN',
  subtotal         numeric(14, 2),
  tax_total        numeric(14, 2),
  total            numeric(14, 2),
  fx_rate          numeric(16, 6) not null default 1,
  amount_inr       numeric(14, 2),
  notes            text,
  category_set_by  uuid references public.profiles (id) on delete set null,
  status           expense_status not null default 'review',
  confirmed_by     uuid references public.profiles (id) on delete set null,
  confirmed_at     timestamptz,
  exported_at      timestamptz,
  zoho_reference   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index expenses_invoice_date_idx on public.expenses (invoice_date);
create index expenses_vendor_idx on public.expenses (vendor_id);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_status_idx on public.expenses (status);
create index expenses_record_type_idx on public.expenses (record_type);
create unique index expenses_document_key on public.expenses (document_id);

create table public.expense_line_items (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  line_no      int,
  description  text,
  hsn_sac      text,
  quantity     numeric(14, 3),
  unit_price   numeric(14, 2),
  amount       numeric(14, 2),
  tax_rate     numeric(6, 2)
);
create index expense_line_items_expense_idx on public.expense_line_items (expense_id);

create table public.expense_taxes (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  tax_type     tax_type not null,
  rate         numeric(6, 2),
  amount       numeric(14, 2) not null default 0,
  jurisdiction text
);
create index expense_taxes_expense_idx on public.expense_taxes (expense_id);

-- -----------------------------------------------------------------------------
-- audit_log
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  entity      text not null,
  entity_id   text not null,
  action      text not null,
  diff        jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch   before update on public.profiles   for each row execute function public.touch_updated_at();
create trigger documents_touch  before update on public.documents  for each row execute function public.touch_updated_at();
create trigger expenses_touch   before update on public.expenses   for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.vendors           enable row level security;
alter table public.documents         enable row level security;
alter table public.extraction_jobs   enable row level security;
alter table public.expenses          enable row level security;
alter table public.expense_line_items enable row level security;
alter table public.expense_taxes     enable row level security;
alter table public.audit_log         enable row level security;

-- profiles: everyone on the team can read; you can edit your own display name;
-- role changes happen out-of-band (SQL / service role).
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- categories: all staff read; all staff create/update; only managers archive/delete.
create policy categories_select on public.categories
  for select to authenticated using (true);
create policy categories_write on public.categories
  for insert to authenticated with check (public.can_write());
create policy categories_update on public.categories
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy categories_delete on public.categories
  for delete to authenticated using (public.can_manage());

-- vendors
create policy vendors_select on public.vendors
  for select to authenticated using (true);
create policy vendors_write on public.vendors
  for insert to authenticated with check (public.can_write());
create policy vendors_update on public.vendors
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy vendors_delete on public.vendors
  for delete to authenticated using (public.can_manage());

-- documents
create policy documents_select on public.documents
  for select to authenticated using (true);
create policy documents_write on public.documents
  for insert to authenticated with check (public.can_write());
create policy documents_update on public.documents
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy documents_delete on public.documents
  for delete to authenticated using (public.can_manage());

-- extraction_jobs: readable by the team; writes go through the service role
-- (the extraction pipeline), so no INSERT/UPDATE policy for authenticated users.
create policy extraction_jobs_select on public.extraction_jobs
  for select to authenticated using (true);

-- expenses: all staff read + create + edit while in review; confirm/export/delete
-- for managers. (Enforcement of the status transition lives in server actions;
-- these policies are the coarse gate.)
create policy expenses_select on public.expenses
  for select to authenticated using (true);
create policy expenses_write on public.expenses
  for insert to authenticated with check (public.can_write());
create policy expenses_update on public.expenses
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy expenses_delete on public.expenses
  for delete to authenticated using (public.can_manage());

create policy expense_line_items_select on public.expense_line_items
  for select to authenticated using (true);
create policy expense_line_items_write on public.expense_line_items
  for all to authenticated using (public.can_write()) with check (public.can_write());

create policy expense_taxes_select on public.expense_taxes
  for select to authenticated using (true);
create policy expense_taxes_write on public.expense_taxes
  for all to authenticated using (public.can_write()) with check (public.can_write());

-- audit_log: team can read; inserts via service role or SECURITY DEFINER helpers.
create policy audit_log_select on public.audit_log
  for select to authenticated using (true);
create policy audit_log_insert on public.audit_log
  for insert to authenticated with check (actor_id = auth.uid());

-- =============================================================================
-- Storage: private bucket for the original documents
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents bucket read" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
create policy "documents bucket insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');
create policy "documents bucket update" on storage.objects
  for update to authenticated using (bucket_id = 'documents');
create policy "documents bucket delete" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and public.can_manage());

-- =============================================================================
-- Seed: categories for a CNC / precision engineering shop
-- =============================================================================
insert into public.categories (name, zoho_account_name, default_record_type) values
  ('Raw Material – Metal/Bar Stock', 'Cost of Goods Sold',        'invoice'),
  ('Tooling & Inserts',              'Consumables',                'invoice'),
  ('Cutting Fluid/Coolant',          'Consumables',                'invoice'),
  ('Consumables',                    'Consumables',                'invoice'),
  ('Machine Spares',                 'Repairs and Maintenance',    'invoice'),
  ('Machine Maintenance/AMC',        'Repairs and Maintenance',    'invoice'),
  ('Subcontract / Job Work',         'Subcontracting Expense',     'invoice'),
  ('Calibration & Testing',          'Professional Fees',          'invoice'),
  ('Electricity (HT)',               'Electricity Expense',        'expense'),
  ('Factory Rent',                   'Rent Expense',               'expense'),
  ('Wages/Labour',                   'Wages',                      'expense'),
  ('Freight & Transport',            'Freight and Postage',        'invoice'),
  ('Fuel',                           'Fuel/Mileage Expenses',      'expense'),
  ('Office Supplies',                'Office Supplies',            'expense'),
  ('Telecom/Internet',               'Telephone Expense',          'expense'),
  ('Professional Fees',              'Professional Fees',          'invoice'),
  ('Bank Charges',                   'Bank Fees and Charges',      'expense'),
  ('Misc',                           'Other Expenses',             'expense')
on conflict (name) do nothing;
