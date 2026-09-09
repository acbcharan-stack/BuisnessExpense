# Phase 1 progress — resume here

_Last worked: 2026-09-10. Say "continue work" to pick this up._

Full plan: `~/.claude/plans/wobbly-twirling-dragonfly.md`. Phase 0 is committed and
pushed (`main`). Phase 1 is **partly done** — the capture + extraction backend and
the Inbox UI are built; the **review screen is not**.

---

## Done in this session (committed as WIP)

| Area | Files |
| --- | --- |
| Gemini extraction | `lib/gemini/prompt.ts`, `lib/gemini/schema.ts` (Gemini `responseSchema` + Zod validator), `lib/gemini/extract.ts` (`extractDocument({bytes, mimeType})`) |
| Pipeline | `lib/extraction/match.ts` (`normalizeVendorName`, `findOrCreateVendor`, `matchCategoryId`), `lib/extraction/pipeline.ts` (`runExtractionJob(admin, jobId)` — download → Gemini → upsert `expenses`/line items/taxes; backoff; `MAX_ATTEMPTS = 3`) |
| Helpers | `lib/hash.ts` (`sha256Hex`, `extensionForMime`), `lib/supabase/storage.ts` (`createSignedDocumentUrl`) |
| Upload API | `app/api/documents/route.ts` (POST: auth → validate → sha256 de-dupe → storage upload → `documents` + `extraction_jobs` rows → run extraction inline) |
| Retry API | `app/api/documents/[id]/retry/route.ts` (POST), `app/api/cron/retry/route.ts` (GET, `CRON_SECRET` bearer) |
| Cron | `vercel.json` — hourly `/api/cron/retry` (Vercel Hobby throttles crons to daily; the inline path at upload is primary, plus the manual Retry button) |
| Inbox UI | `app/(app)/inbox/page.tsx` rewritten: `UploadDropzone` (drag/drop, multi-file), "Needs review" list, "Recent uploads" with `RetryButton` |
| Review (partial) | `app/(app)/records/[id]/form-schema.ts` (Zod `recordFormSchema` + `RecordFormValues`), `app/(app)/records/[id]/actions.ts` (`saveRecord`, `confirmRecord` — role-gated to owner/accountant) |

Checkpoint state: `npm run typecheck`, `lint`, `test` (16), and `next build` all pass.

---

## Next steps (do these to finish Phase 1)

1. **Build the review screen** — the Inbox already links to `/records/{expenseId}` but that route has no `page.tsx` yet.
   - `app/(app)/records/[id]/page.tsx` (server): load the expense by id (`notFound()` if missing), plus its `documents` row, `expense_line_items` (ordered by `line_no`), `expense_taxes`, all `categories`, a vendor list (`id, name`, limit ~500), and a signed URL via `createSignedDocumentUrl`. Compute `canManage` from `requireProfile()` role. Pass all to `<ReviewForm/>`.
   - `app/(app)/records/[id]/review-form.tsx` (client): two-pane layout.
     - Left: document preview — `<img>` for image mime, `<iframe>` for `application/pdf`.
     - Right: fields matching `RecordFormValues` — `record_type` toggle (moves item between Invoices/Expenses tabs), vendor name (text + `<datalist>` of existing), category `<select>` + inline "New category…" (`new_category_name`), `invoice_number`, `invoice_date`/`due_date` (date inputs), `currency`, `country`, `subtotal`/`tax_total`/`total`, `notes`, editable **line items** table (add/remove rows), editable **taxes** table (add/remove; `tax_type` from `TAX_TYPES`).
     - Buttons: **Save** → `saveRecord(expenseId, values)`; **Confirm** → `confirmRecord(expenseId)`, render only when `canManage`.
     - Show extraction `notes` + `confidence` from the latest `extraction_jobs.raw_response` if handy (optional).
2. **Link list rows to review** — in `app/(app)/records-list.tsx` wrap each row in `<Link href={`/records/${r.id}`}>`.
3. **Manual test** (needs live Supabase + `GEMINI_API_KEY` — see below): upload a real invoice via Inbox → confirm a `documents` row + `extraction_jobs` row + `expenses` row (status `review`) appear → open review screen → edit + Save → Confirm → row moves to Invoices/Expenses tab.
4. **Add tests**: `lib/extraction/match.test.ts` for `normalizeVendorName`; consider a `recordFormSchema` parse test.
5. Commit; then Phase 2 (PWA + camera + email intake) or Phase 3 (dashboard + CSV/Zoho export).

---

## Blockers / things the user still owes

- **Supabase project not created yet.** No `NEXT_PUBLIC_SUPABASE_URL` / keys in `.env.local`, schema not pushed, 3 users not created. Setup steps are in `README.md` (§2–3) — nothing runs against real data until that's done.
- **`GEMINI_API_KEY` not set** — extraction will throw "Missing required environment variable" until it is.
- **GitHub push**: this machine's git credential is `kraftsboon`; repo is `acbcharan-stack/BuisnessExpense`. User was going to clear the cached credential (Windows Credential Manager) and re-auth as `acbcharan-stack`. Until then pushes need a fine-grained PAT.

## Watch-outs for next session

- Supabase DB types are **hand-written** in `lib/supabase/database.types.ts` as `type` aliases (not `interface` — the query builder needs `Record<string,unknown>` compatibility). Once the project is linked, regenerate: `npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/database.types.ts`, then drop the hand-written notes.
- `extraction_jobs` has **no RLS insert/update policy** for `authenticated` — all writes to it go through the **admin (service-role) client** on purpose. Keep it that way.
- Next.js 16: middleware = `proxy.ts` at repo root (`export function proxy`). Don't reintroduce `middleware.ts`.
- API routes that call Gemini set `export const maxDuration` (60 / 300). Keep that.
