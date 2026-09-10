# Invoice Scanner

Capture and organise **all money-out documents** for a CNC / precision engineering
shop — supplier invoices (raw metal, tooling, coolant, machine AMC, job work) and
running expenses (electricity, wages, rent, freight). Photograph, upload, or email
a bill; Google Gemini extracts the fields; a human reviews; the data feeds a
dashboard, CSV/Excel export, and a Zoho Books-compatible export.

Stack: **Next.js 16** (App Router) on **Vercel**, **Supabase** (Postgres + Auth +
Storage), **Google Gemini** for document extraction.

The full build plan lives in
`~/.claude/plans/wobbly-twirling-dragonfly.md`.

---

## Status

**Phase 0 — Foundations: done.**

- Next.js + Tailwind 4 + TypeScript scaffold
- Supabase browser / server / admin clients + session `proxy.ts`
- Email + password auth (no public sign-up), login + password-reset flow
- App shell with tabs: Dashboard · Inbox · Invoices · Expenses · Settings
- Initial DB schema + RLS + seed categories (`supabase/migrations/0001_init.sql`)
- India GST helpers (`lib/tax/`) with unit tests

Phases 1–4 (capture + Gemini extraction, mobile/PWA + email intake, reporting +
Zoho export, enhancements) are not built yet.

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project
     Settings → API
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role`
   - `SUPABASE_DB_PASSWORD` — Project Settings → Database
3. Push the schema:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

### 3. Create the user accounts

In the Supabase dashboard → Authentication → Users → **Add user** (email +
password, "Auto Confirm"), once per person. A `profiles` row is created
automatically for each, at access **level 1**.

Every signed-in user has full access (upload, edit, confirm, export, delete,
settings). `profiles.role` is a 1&ndash;4 label only — set it in the SQL editor
if you want to record a tier:

```sql
update public.profiles set full_name = 'Your Name', role = 1 where id = '<your-uuid>';
update public.profiles set full_name = 'Colleague', role = 2 where id = '<uuid-2>';
```

### 4. Gemini key

Create a key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY` in
`.env.local`. (Only needed once Phase 1 lands.)

### 5. Run

```bash
npm run dev            # http://localhost:3000
```

---

## Scripts

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Dev server                          |
| `npm run build`     | Production build                    |
| `npm run start`     | Serve the production build          |
| `npm run lint`      | ESLint                              |
| `npm run typecheck` | `tsc --noEmit`                      |
| `npm test`          | Vitest (unit)                       |

---

## Deploying to Vercel

1. Push this folder to its own GitHub repo (see **Git note** below).
2. Import the repo in Vercel.
3. Add every variable from `.env.example` to the Vercel project (Environment
   Variables), using production values. Set `NEXT_PUBLIC_SITE_URL` to the
   deployment URL.
4. In Supabase → Authentication → URL Configuration, add the Vercel URL to the
   redirect allow-list so password-reset links work.

---

## Git note

This folder currently sits inside a stray git repository rooted at
`C:\Users\acboo` (your home directory) with no commits. Before pushing to
GitHub, give the project its **own** repository — either run `git init` here, or
remove the accidental `~/.git` if you confirm nothing depends on it. `.env.local`
and `BuisnessExpense.txt` are already git-ignored.

---

## Project layout

```
app/(auth)/       login + password reset
app/(app)/        authenticated shell + Dashboard/Inbox/Invoices/Expenses/Settings
lib/supabase/     client / server / admin / proxy helpers + hand-written DB types
lib/tax/          GST validation, CGST-SGST vs IGST, Indian financial-year helpers
lib/env.ts        validated environment access
supabase/migrations/  SQL schema + RLS + seed data
proxy.ts          Next.js 16 proxy (session refresh + auth gate)
```
