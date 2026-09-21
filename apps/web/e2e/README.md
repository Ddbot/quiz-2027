# Playwright e2e (local/manual only)

Not part of any CI job (poc-validation-run design.md D1) — this covers a
slice of SPEC.md's G-2 happy path end-to-end against real local dev servers,
run and read by a human before/while reviewing a change, not on every push.

## Prerequisites

1. `npx supabase start` (or a fresh `npx supabase db reset`) at the repo root.
2. `pnpm --filter party exec wrangler dev` — apps/party, default port 8787.
3. `pnpm --filter web dev` — the Vite dev server, default port 5173.
4. Copy `apps/web/.env.e2e.example` to `apps/web/.env.e2e` and fill in
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`.
5. Once: `pnpm --filter web exec playwright install chromium`.

## Run

```
pnpm --filter web test:e2e
```

`e2e/global-setup.ts` creates one throwaway draft event via the service-role
client before the spec runs; `e2e/happy-path.spec.ts` then drives a real
browser through: landing page -> enter join code -> anonymous join with
consent -> confirm the permanent name -> reach the joined/team-lobby state.
