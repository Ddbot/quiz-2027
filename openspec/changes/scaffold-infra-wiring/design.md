## Context

Greenfield. See `proposal.md` — Why. The architecture, stack, and constraints are fixed in `SPEC.md` (§7.2 stack, §7.6 infra, NFR-007/013/016/017/018) and `REQUIREMENTS.md` v1.1. This design only settles the repository shape, the wiring between the three free-tier platforms, and how the `eu`-jurisdiction risk (Q-001) gets tested. Local tooling note: the OpenSpec CLI and Wrangler need Node ≥ 20.19; the machine currently has 20.14, so a pinned Node version is part of this change.

## Goals / Non-Goals

**Goals:**
- A workspace that builds, lints, type-checks, and deploys all three surfaces from `main`.
- A running `EventRoom` Durable Object per event id, EU-pinned, with a connect/echo contract.
- Sentry on both runtimes; a keepalive for the Supabase free project.
- A recorded answer to Q-001 (EU jurisdiction on the Workers free plan).

**Non-Goals:**
- Any auth, data model, or game behavior (later milestones).
- Real UI beyond placeholder route shells.
- A domain (placeholder host until Q-002 is resolved).
- Load/performance work; the 10-connection harness is scaffolded but not exercised here.

## Decisions

### D1 — pnpm workspace monorepo

Layout:
```
apps/web        Vite + React 18 + TS SPA (routes: /e/:joinCode, /admin/*, /screen/:eventId)
apps/party      Cloudflare Worker: EventRoom Durable Object (partyserver)
packages/shared TS-only, zero platform deps — future home of scoring/timer/MCQ logic
supabase/       CLI project: config.toml + migrations/ (one empty initial migration)
tools/harness   Node partysocket script stub (simulated clients; not run in CI yet)
.github/workflows/  ci.yml, deploy-worker.yml, supabase-keepalive.yml
```
Rationale: NFR-017 requires a platform-independent logic package, which forces at least a shared package + two consumers — a workspace is the natural fit. One repo = one history, one CI, one PR flow for a solo developer. Alternatives: polyrepo (more overhead, cross-repo version drift) rejected; single package with folders (can't enforce the "shared has no platform deps" boundary via dependency graph) rejected. pnpm over npm/yarn for fast, strict, first-class workspaces; Vercel and Wrangler both support pnpm workspaces.

### D2 — Local Supabase via `supabase start`, one cloud project for production

Local development runs the Supabase Docker stack (`supabase start`); production is a single cloud project in an EU region. Rationale: the free tier allows few projects and pauses idle ones — keeping only a clean production project avoids churn, and local Docker gives offline, resettable schema work. Migrations authored locally, applied to production with `supabase db push` (manually or from CI). Alternative (a shared cloud "dev" project) rejected: burns a free slot and still pauses.

### D3 — EventRoom addressing

One Durable Object class `EventRoom` in `apps/party`, addressed by event id via `partyserver`'s routing (`getServerByName` / `routePartyRequest`). The namespace binding is obtained through `.jurisdiction("eu")` before deriving the per-event stub, so every event object is EU-pinned. `wrangler.jsonc` declares the class as a **SQLite-backed** Durable Object (`new_sqlite_classes` migration) — required for the free plan and for later durable buffering (SPEC.md FR-082). Baseline behavior: accept the socket, echo text, nothing else.

### D4 — Deploy pipelines

- **web** → Vercel native Git integration. Root Directory set to `apps/web`; build command `pnpm --filter web build`; framework preset Vite. No GitHub Action needed.
- **party** → `deploy-worker.yml`: on push to `main` touching `apps/party` or `packages/shared`, run `pnpm --filter party exec wrangler deploy`. Auth via `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` GitHub secrets.
- **schema** → `supabase db push` run manually for now; a `supabase-deploy` job is deferred until there is a schema worth gating (MILESTONE-02).
- **CI** (`ci.yml`) on every PR: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test`. Required status checks on `main`.

### D5 — Secrets & config

`.env.example` committed per app; real values are: Vercel project env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`, `VITE_PARTY_HOST`); Wrangler secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `SENTRY_DSN`) via `wrangler secret put` and mirrored as GitHub secrets for CI deploys. The service-role key never enters `apps/web` or any client bundle (NFR-006). No secret is committed.

### D6 — Sentry

`@sentry/react` in `apps/web` (init in `main.tsx`, guarded so it's a no-op without a DSN); `@sentry/cloudflare` in `apps/party` (`withSentry` wrapper). Free "Developer" plan, EU data region selected at project creation.

### D7 — Keepalive

`supabase-keepalive.yml`: scheduled `cron` every 3 days, `curl -fsS "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY"`. Rationale: no extra infrastructure, well inside the ~7-day pause window (NFR-003).

### D8 — Q-001 verification

`apps/party` gets a temporary diagnostic route `GET /__diag/jurisdiction` that creates an `EventRoom` stub through the `eu`-jurisdiction namespace and reports success/error. After the first production deploy, hit it once, record the result in this change (design "Open Questions" resolution + PR description) and update `SPEC.md` Q-001 status. Remove the route before the milestone closes. Rationale: the only trustworthy test is the real platform + real plan.

### D9 — Node 22 LTS, pinned

`.nvmrc` = `22`, `engines.node >= 20.19` in root `package.json`, CI on Node 22. The developer runs `nvm install` locally before working.

## Risks / Trade-offs

- **EU jurisdiction may be unavailable on the Workers free plan (Q-001)** → D8 verifies early; the PoC uses test data only, so a temporary non-EU placement is tolerable while the owner decides whether to enable the $5 Workers Paid plan sooner. The residency spec requirement is explicitly marked unmet in that case, not glossed.
- **Vercel monorepo detection** → set Root Directory + build command explicitly in project settings; document in README. Without it, Vercel builds from repo root and fails.
- **Durable Objects need Workers enabled on the Cloudflare account** and a correct `migrations` block; a missing `new_sqlite_classes` entry causes deploy errors → covered by a task with the exact `wrangler.jsonc` shape.
- **pnpm version drift between local, CI, and Vercel** → pin `packageManager` in root `package.json` (Corepack).
- **Two-project Supabase limit** → only one cloud project is created; local is Docker.
- **Secret sprawl across three dashboards** → README has a single "secrets matrix" table; `.env.example` mirrors it.

## Migration Plan

Greenfield, so "migration" is first-time setup; rollback of any step is `git revert` plus deleting the just-created cloud resource. Order:
1. Scaffold the workspace; CI green on a draft PR.
2. Create the Supabase cloud project (EU); commit `supabase/config.toml` + empty initial migration; `supabase db push`.
3. Create the Cloudflare Worker; land `apps/party` with `EventRoom` + `eu` namespace + diagnostic route; `deploy-worker.yml` green.
4. Create the Vercel project pointed at `apps/web`; first deploy green.
5. Create Sentry projects (EU region); wire DSNs.
6. Add `supabase-keepalive.yml`.
7. Run the Q-001 diagnostic; record the result; update `SPEC.md`; remove the diagnostic route.
8. Merge; tag `m01-scaffold`.

## Open Questions

- **Q-002 (domain):** not yet registered. A placeholder host (`quiz2027.vercel.app` + `*.workers.dev`) is used everywhere. Registering a domain later changes only environment values and DNS, not the specs, the approach, or the task list — safe to defer.
