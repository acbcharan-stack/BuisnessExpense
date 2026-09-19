-- =============================================================================
-- 0005 — Generated invoices: convert a Purchase Order record into a proper,
-- numbered tax-invoice PDF (either a self-issued "purchase" invoice for a
-- vendor who never sent one, or a "sale" invoice billing a customer who sent
-- a PO). See docs/phase-1-progress.md / CLAUDE.md for the feature context.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- businesses: bank + branding + numbering + terms, used on the letterhead
-- -----------------------------------------------------------------------------
alter table public.businesses
  add column if not exists bank_account_name    text,
  add column if not exists bank_account_number  text,
  add column if not exists bank_ifsc            text,
  add column if not exists bank_name            text,
  add column if not exists signature_storage_path text,
  add column if not exists logo_storage_path    text,
  add column if not exists invoice_prefix       text,
  add column if not exists terms_and_conditions text;

-- -----------------------------------------------------------------------------
-- Sequential numbering: one counter per (business, direction, financial year)
-- -----------------------------------------------------------------------------
create table public.invoice_number_counters (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  direction    text not null check (direction in ('purchase', 'sale')),
  fy_label     text not null,
  next_seq     int  not null default 1,
  primary key (business_id, direction, fy_label)
);

-- Atomically hands out the next sequence number for (business, direction, fy).
-- The UPDATE ... RETURNING takes a row lock, so concurrent callers serialize
-- on that row instead of racing on a plain read-then-write.
create or replace function public.allocate_invoice_seq(
  p_business_id uuid,
  p_direction   text,
  p_fy_label    text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  insert into public.invoice_number_counters (business_id, direction, fy_label)
  values (p_business_id, p_direction, p_fy_label)
  on conflict (business_id, direction, fy_label) do nothing;

  update public.invoice_number_counters
     set next_seq = next_seq + 1
   where business_id = p_business_id
     and direction = p_direction
     and fy_label = p_fy_label
  returning next_seq - 1 into v_seq;

  return v_seq;
end;
$$;
grant execute on function public.allocate_invoice_seq(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- generated_invoices: the converted document (one active row per source record)
-- -----------------------------------------------------------------------------
create table public.generated_invoices (
  id                  uuid primary key default gen_random_uuid(),
  source_expense_id   uuid not null references public.expenses (id) on delete cascade,
  direction           text not null check (direction in ('purchase', 'sale')),
  status              text not null default 'draft' check (status in ('draft', 'confirmed', 'void')),
  business_id         uuid not null references public.businesses (id),
  -- Snapshots, not live FKs: freezes the letterhead as of generation/confirm
  -- time so a later edit to a vendor or business profile can't retroactively
  -- rewrite the data behind an already-issued invoice number.
  counterparty        jsonb not null default '{}',
  our_business        jsonb not null default '{}',
  our_invoice_number  text,
  our_invoice_date    date,
  fy_label            text,
  currency            text not null default 'INR',
  subtotal            numeric(14, 2),
  tax_total           numeric(14, 2),
  total               numeric(14, 2),
  notes               text,
  pdf_storage_path    text,
  pdf_generated_at    timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  confirmed_by        uuid references public.profiles (id) on delete set null,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Only one *active* generated invoice per source record; a voided attempt
-- frees the slot up for a redo.
create unique index generated_invoices_source_active_key
  on public.generated_invoices (source_expense_id) where status <> 'void';
create index generated_invoices_business_idx on public.generated_invoices (business_id);

create trigger generated_invoices_touch
  before update on public.generated_invoices
  for each row execute function public.touch_updated_at();

create table public.generated_invoice_line_items (
  id                    uuid primary key default gen_random_uuid(),
  generated_invoice_id  uuid not null references public.generated_invoices (id) on delete cascade,
  line_no               int,
  description           text,
  hsn_sac               text,
  quantity              numeric(14, 3),
  unit_price            numeric(14, 2),
  amount                numeric(14, 2),
  tax_rate              numeric(6, 2)
);
create index generated_invoice_line_items_invoice_idx
  on public.generated_invoice_line_items (generated_invoice_id);

create table public.generated_invoice_taxes (
  id                    uuid primary key default gen_random_uuid(),
  generated_invoice_id  uuid not null references public.generated_invoices (id) on delete cascade,
  tax_type              tax_type not null,
  rate                  numeric(6, 2),
  amount                numeric(14, 2) not null default 0,
  jurisdiction          text
);
create index generated_invoice_taxes_invoice_idx
  on public.generated_invoice_taxes (generated_invoice_id);

-- -----------------------------------------------------------------------------
-- Row Level Security — mirrors expenses: team reads/writes freely, no delete
-- (void instead); status-transition enforcement lives in server actions.
-- -----------------------------------------------------------------------------
alter table public.generated_invoices           enable row level security;
alter table public.generated_invoice_line_items enable row level security;
alter table public.generated_invoice_taxes      enable row level security;

create policy generated_invoices_select on public.generated_invoices
  for select to authenticated using (true);
create policy generated_invoices_write on public.generated_invoices
  for insert to authenticated with check (public.can_write());
create policy generated_invoices_update on public.generated_invoices
  for update to authenticated using (public.can_write()) with check (public.can_write());

create policy generated_invoice_line_items_select on public.generated_invoice_line_items
  for select to authenticated using (true);
create policy generated_invoice_line_items_write on public.generated_invoice_line_items
  for all to authenticated using (public.can_write()) with check (public.can_write());

create policy generated_invoice_taxes_select on public.generated_invoice_taxes
  for select to authenticated using (true);
create policy generated_invoice_taxes_write on public.generated_invoice_taxes
  for all to authenticated using (public.can_write()) with check (public.can_write());

-- -----------------------------------------------------------------------------
-- Storage: business-assets (signatures/logos, durable branding — kept
-- separate from the `documents` bucket so it's unaffected by document
-- deletion/cascade), and generated-invoices (the rendered PDFs)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('business-assets', 'business-assets', false)
on conflict (id) do nothing;

create policy "business assets bucket read" on storage.objects
  for select to authenticated using (bucket_id = 'business-assets');
create policy "business assets bucket insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'business-assets');
create policy "business assets bucket update" on storage.objects
  for update to authenticated using (bucket_id = 'business-assets');
create policy "business assets bucket delete" on storage.objects
  for delete to authenticated using (bucket_id = 'business-assets' and public.can_manage());

insert into storage.buckets (id, name, public)
values ('generated-invoices', 'generated-invoices', false)
on conflict (id) do nothing;

create policy "generated invoices bucket read" on storage.objects
  for select to authenticated using (bucket_id = 'generated-invoices');
create policy "generated invoices bucket insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'generated-invoices');
create policy "generated invoices bucket update" on storage.objects
  for update to authenticated using (bucket_id = 'generated-invoices');
create policy "generated invoices bucket delete" on storage.objects
  for delete to authenticated using (bucket_id = 'generated-invoices' and public.can_manage());
