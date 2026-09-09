@AGENTS.md

# Invoice Scanner — project notes

Expense + invoice capture for a **CNC / precision engineering shop in Chennai,
India**. Next.js 16 (App Router) on Vercel · Supabase (Postgres + Auth + Storage)
· Google Gemini for document extraction. Full plan:
`~/.claude/plans/wobbly-twirling-dragonfly.md`.

## Conventions

- **Next.js 16**: middleware is `proxy.ts` (root), exporting `proxy()`. Read
  `node_modules/next/dist/docs/` before using unfamiliar APIs.
- **Supabase clients**: `lib/supabase/server.ts` (RSC / actions / route handlers),
  `client.ts` (Client Components), `admin.ts` (service role — trusted server code
  only, never reaches the browser).
- **DB types** are hand-written in `lib/supabase/database.types.ts` as `type`
  aliases (not `interface` — the query builder needs `Record<string, unknown>`
  compatibility). Regenerate with `supabase gen types` once the project is linked.
- **Env** goes through `lib/env.ts` (`publicEnv` getters, `getServerEnv()`).
- **Roles**: `owner`, `accountant`, `staff` on `public.profiles`. `can_write()` =
  any of the three; `can_manage()` = owner/accountant (confirm / export / delete).
- **Two tabs** come from `expenses.record_type` (`invoice` vs `expense`).
- Tests: Vitest, files `*.test.ts` next to source.

## Build order

Phase 0 done. Phase 1 in progress — see `docs/phase-1-progress.md` for exactly
where to resume (backend + Inbox built; review screen `/records/[id]` not built).
