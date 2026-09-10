-- =============================================================================
-- Invoice Scanner — 0002: manual records + custom fields
-- =============================================================================

-- Records entered by hand have no source document.
alter table public.expenses
  alter column document_id drop not null;

-- Free-form extra fields a reviewer adds ([{ "label": "...", "value": "..." }]).
alter table public.expenses
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;
