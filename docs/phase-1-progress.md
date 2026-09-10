# Phase 1 progress — resume here

_Last worked: 2026-09-10. Say "continue work" to pick this up._

Full plan: `~/.claude/plans/wobbly-twirling-dragonfly.md`. Phase 0 is committed and
pushed (`main`). Phase 1 is **feature-complete pending live-data testing** — the
capture + extraction backend, the Inbox UI, **and the review screen** are built.
The only thing left is a real end-to-end test against a live Supabase project +
`GEMINI_API_KEY` (see Blockers), then commit.

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
| Review actions | `app/(app)/records/[id]/form-schema.ts` (Zod `recordFormSchema` + `RecordFormValues`), `app/(app)/records/[id]/actions.ts` (`saveRecord`, `confirmRecord` — save open to any writer, confirm role-gated to owner/accountant) |
| Review screen | `app/(app)/records/[id]/page.tsx` (server: loads expense + document + line items + taxes + categories + vendor list + signed URL + latest job for confidence; `notFound()` on bad id), `app/(app)/records/[id]/review-form.tsx` (client: two-pane — doc preview left, editable fields right; `record_type` toggle, vendor `<datalist>`, category `<select>` + new-category field, editable line-item & tax grids, Save / Save&confirm; read-only banner when status ≠ `review`; image `onError` fallback; redirects to `/inbox` on confirm) |
| List → review links | `app/(app)/records-list.tsx` — every cell wrapped in `<Link href={`/records/${r.id}`}>` with row hover |
| Tests | `lib/extraction/match.test.ts` (`normalizeVendorName`, 6 cases) |
| Vitest config | `vitest.config.mts` — aliases `server-only` → `vitest/server-only-stub.ts` so `lib/extraction/match.ts` is importable in tests |

Checkpoint state: `npm run typecheck`, `lint`, `test` (21), and `next build` all pass.

---

## Next steps (do these to finish Phase 1)

1. **Manual end-to-end test** (needs live Supabase + `GEMINI_API_KEY` — see Blockers): upload a real invoice via Inbox → confirm a `documents` row + `extraction_jobs` row + `expenses` row (status `review`) appear → open review screen → check the preview renders, edit fields + Save → Save&confirm → row leaves the Inbox queue and appears in the Invoices/Expenses tab with status `confirmed`.
2. Consider a `recordFormSchema` parse test (edge cases: empty money strings → null, bad dates rejected).
3. Commit; then Phase 2 (PWA + camera + email intake) or Phase 3 (dashboard + CSV/Zoho export).

### Known follow-ups / polish ideas for the review screen
- `currency` / `country` are free-text inputs — could become `<select>`s later.
- No client-side "totals don't add up" warning yet (subtotal + tax_total vs total).
- HEIC uploads won't preview inline in most browsers — handled with an "Open original" fallback, not a conversion.

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
