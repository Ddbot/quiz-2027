## 1. Workspace scaffold

- [ ] 1.1 Initialise a pnpm workspace at the repo root: `pnpm-workspace.yaml` covering `apps/*`, `packages/*`, `tools/*`; root `package.json` with `packageManager` pinned (Corepack) and `engines.node >= 20.19`; `.nvmrc` = `22`. Verify `pnpm install` succeeds on Node 22.
- [ ] 1.2 Add shared config: root `tsconfig.base.json`, ESLint flat config, Prettier, `.editorconfig`, `.gitignore` (node_modules, dist, `.env*`, `.wrangler`, `.vercel`, Supabase volumes), `.env.example` placeholders per app. Verify `pnpm -r lint` runs with zero errors on the empty tree.
- [ ] 1.3 Add root scripts `typecheck`, `lint`, `build`, `test` that fan out with `pnpm -r`. Verify each runs (no-op success) before packages exist.
- [ ] 1.4 Write `README.md` with a secrets matrix table (service → variable → where set) and local setup steps (`nvm install`, `pnpm install`, `supabase start`, `pnpm dev`). Verify a second person could follow it (self-review checklist in the PR).

## 2. Shared package (`packages/shared`)

- [ ] 2.1 Create `packages/shared` as a TS-only package (no `dependencies`; `devDependencies` limited to `typescript`, `vitest`). Export a trivial placeholder (e.g. `packageName` constant) plus a `types.ts` stub. Verify `pnpm --filter @quiz/shared build` emits `dist/`.
- [ ] 2.2 Add a Vitest suite with one passing test and an ESLint `no-restricted-imports` rule banning `react`, `partyserver`, `cloudflare:*`, `@supabase/*`, `@sentry/*`. Verify `pnpm --filter @quiz/shared test` passes and the lint rule flags a deliberately-added `import "react"` (then remove it).
- [ ] 2.3 Add a workspace dependency-graph check (script using `pnpm list --filter @quiz/shared --depth 0 --json`) asserting the package has no runtime deps. Verify the script exits 0.

## 3. Web app shell (`apps/web`)

- [ ] 3.1 Scaffold Vite + React 18 + TS in `apps/web`; add Tailwind and shadcn/ui (`components.json`, CSS variables, slate base) and one generated `Button` component. Verify `pnpm --filter web dev` serves and `pnpm --filter web build` produces `dist/`.
- [ ] 3.2 Add `react-router-dom` with routes `/e/:joinCode` (player placeholder, reads and displays the join code), `/admin/*` (admin placeholder), `/screen/:eventId` (big-screen placeholder shell, reads the event id). Verify a Vitest + Testing Library test renders each route and asserts the URL param is shown.
- [ ] 3.3 Add a `VITE_PARTY_HOST` env binding and a dev-only "ping" widget on `/screen/:eventId` that opens a `partysocket` connection for the event id, sends `"hello"`, and displays the echoed reply. Verify against a locally running worker (`wrangler dev`) that the echo appears.
- [ ] 3.4 Add responsive viewport meta and a minimal high-contrast base theme for `/screen`. Verify the player and screen placeholders load in iOS Safari and Android Chrome (BrowserStack or a real device), and admin/screen in desktop Chrome and Edge; record which was used in the PR.

## 4. Real-time worker (`apps/party`)

- [ ] 4.1 Scaffold `apps/party` as a Cloudflare Worker with `partyserver`; add `wrangler.jsonc` declaring an `EventRoom` class as a SQLite-backed Durable Object (`migrations` with `new_sqlite_classes: ["EventRoom"]`), `compatibility_date`, and `compatibility_flags` as needed. Verify `pnpm --filter party exec wrangler deploy --dry-run` succeeds.
- [ ] 4.2 Implement `EventRoom` extending `partyserver`'s `Server`: on WebSocket message, echo the text back to the sender; no auth, no state. Route requests by event id, deriving the stub from a namespace handle obtained via `.jurisdiction("eu")`. Verify a Vitest + `@cloudflare/vitest-pool-workers` test: two clients for event `E` connect, each echo works, and both are shown to hit one instance.
- [ ] 4.3 Add a temporary diagnostic route `GET /__diag/jurisdiction` that instantiates an `EventRoom` stub through the `eu` namespace and returns `{ ok: true }` or the error. Verify it returns `ok:true` under `wrangler dev`.
- [ ] 4.4 Add `withSentry` (`@sentry/cloudflare`) around the worker fetch handler, DSN from a secret, no-op when absent. Verify a forced throw on a `/__diag/boom` route is captured locally (or in the Sentry project after deploy).

## 5. Supabase project (`supabase/`)

- [ ] 5.1 Run `supabase init`; commit `supabase/config.toml`. Verify `supabase start` brings the local stack up and `supabase status` shows all services healthy.
- [ ] 5.2 Add an initial empty migration (`supabase/migrations/0000_init.sql` with a comment only). Verify `supabase db reset` applies cleanly from empty.
- [ ] 5.3 Create the production Supabase project in an EU region (dashboard); record project ref and region in the PR. Verify the region shown in project settings is an EU region.
- [ ] 5.4 Link the repo (`supabase link`) and run `supabase db push` to production. Verify the production migration history shows `0000_init`.

## 6. CI and deployment

- [ ] 6.1 Add `.github/workflows/ci.yml`: on PR, Node 22, `pnpm install --frozen-lockfile`, then `pnpm -r typecheck lint build test`. Verify a PR shows all checks green and that an injected type error makes the check fail.
- [ ] 6.2 Configure branch protection on `main` requiring the CI checks. Verify a PR cannot be merged while a check is red (screenshot in PR).
- [ ] 6.3 Add `.github/workflows/deploy-worker.yml`: on push to `main` touching `apps/party` or `packages/shared`, `wrangler deploy` using `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets. Verify a merge deploys the worker and the run logs show success.
- [ ] 6.4 Create the Vercel project: Root Directory `apps/web`, Vite preset, build `pnpm --filter web build`, install `pnpm install`; set web env vars. Verify a merge to `main` publishes to the production URL and all three routes load.
- [ ] 6.5 Populate all secrets per the README matrix: Wrangler secrets via `wrangler secret put`, GitHub Actions secrets, Vercel env vars. Verify `wrangler secret list` and the GitHub/Vercel settings match the matrix; confirm no service-role key is present in any `apps/web` env.

## 7. Keepalive

- [ ] 7.1 Add `.github/workflows/supabase-keepalive.yml`: `schedule` cron every 3 days, `curl -fsS "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY"`. Verify a manual `workflow_dispatch` run succeeds.

## 8. Q-001 resolution and close-out

- [ ] 8.1 After the first production worker deploy, call `/__diag/jurisdiction` against the deployed worker on the target (free) plan. Record `ok` or the exact error in `proposal.md` (append a "Q-001 result" note) and in the PR description.
- [ ] 8.2 Update `SPEC.md` Q-001 status (Resolved / or Open with the recorded limitation and the residency requirement marked unmet pending an owner plan decision). If unmet, open a follow-up note for the owner.
- [ ] 8.3 Remove the `/__diag/*` routes from `apps/party`. Verify `wrangler deploy --dry-run` still passes and no `__diag` string remains in the source.

## 9. Milestone acceptance verification

- [ ] 9.1 End-to-end check against production: merge a trivial change to `apps/web` and confirm Vercel auto-publishes it; merge a trivial change to `apps/party` and confirm the Action redeploys it. (SPEC.md MILESTONE-01 AC1)
- [ ] 9.2 From a browser, open a WebSocket to the deployed worker for a sample event id, send a message, and confirm the echo. (AC2)
- [ ] 9.3 Confirm the `EventRoom` namespace is created with `jurisdiction: "eu"` in the source and — per task 8.1 — that creation succeeded on the target plan, or that the exception is documented. (AC3)
- [ ] 9.4 Trigger one error in the web app and one in the worker; confirm both appear in Sentry. (AC4)
- [ ] 9.5 Review billing on Supabase, Vercel, Cloudflare, and Sentry; confirm every service is on a free plan. (NFR-013)
- [ ] 9.6 Tag the merge commit `m01-scaffold`.
