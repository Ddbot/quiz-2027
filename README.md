# Quiz 2027

A custom live-event quiz platform. Audience plays MCQ rounds on their phones (solo
or in teams); an MC drives a synchronised flow that updates every phone and the
venue big screen within ~2s; an Operator casts the big screen via the Presentation
API.

**Current iteration — MILESTONE-01 (`scaffold-infra-wiring`):** a zero-cost proof
of concept. Free tiers only, ~10 concurrent connections, validated by a scripted
test event. Not a public show yet.

Authoritative documents: [`REQUIREMENTS.md`](./REQUIREMENTS.md) (v1.1) and
[`SPEC.md`](./SPEC.md) (87 FRs, 19 NFRs, 15 milestones). Change proposals live in
[`openspec/`](./openspec/).

## Repository layout

| Path                 | What it is                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`           | Vite + React 18 + TS SPA. Routes: `/e/:joinCode` (player), `/admin/*`, `/screen/:eventId`. Tailwind v4 + shadcn/ui. Hosted on Vercel.                 |
| `apps/party`         | Cloudflare Worker running the `EventRoom` PartyServer Durable Object (one SQLite-backed instance per event, EU jurisdiction). Deployed with Wrangler. |
| `packages/shared`    | Framework-agnostic TS. Future home of scoring / timer / MCQ logic — no platform deps (enforced by lint + `scripts/check-shared-isolation.mjs`).       |
| `supabase/`          | Supabase CLI project: `config.toml` + `migrations/`. Postgres (RLS on) is the system of record.                                                       |
| `tools/`             | Test / operational scripts (e.g. the 10-client PartySocket harness — added later).                                                                    |
| `.github/workflows/` | `ci.yml` (PR gate), `deploy-worker.yml`, `supabase-keepalive.yml`.                                                                                    |

## Local setup

Prerequisites: [Node](https://nodejs.org) 22 (via `nvm`), [Corepack](https://nodejs.org/api/corepack.html)
(bundled with Node), [Docker](https://www.docker.com/) (for the local Supabase stack).

```bash
nvm install            # uses .nvmrc (Node 22)
corepack enable         # activates the pinned pnpm from package.json
pnpm install

# local Supabase (Postgres, Auth, Storage) — needs Docker running
pnpm exec supabase start
pnpm exec supabase status     # all services should be healthy

pnpm dev                # runs apps/web (Vite) and apps/party (wrangler dev) in parallel
```

Copy each `.env.example` / `.dev.vars.example` next to it and fill in real values:

| File                                         | Used by         |
| -------------------------------------------- | --------------- |
| `apps/web/.env.example` → `.env.local`       | Vite dev server |
| `apps/party/.dev.vars.example` → `.dev.vars` | `wrangler dev`  |

### Common commands

| Command                                    | Effect                                            |
| ------------------------------------------ | ------------------------------------------------- |
| `pnpm dev`                                 | web + worker dev servers                          |
| `pnpm typecheck`                           | `tsc --noEmit` across all packages                |
| `pnpm lint`                                | ESLint across all packages + repo root            |
| `pnpm build`                               | build every package                               |
| `pnpm test`                                | Vitest across all packages                        |
| `pnpm check:shared-isolation`              | assert `@quiz/shared` has zero runtime deps       |
| `pnpm --filter party exec wrangler deploy` | manual worker deploy                              |
| `pnpm exec supabase db push`               | apply migrations to the linked production project |

## Environments

Two only: **local** and **production**. No staging, no preview backend. Vercel
per-PR previews (if enabled) point at the production backend services.

- **web** → Vercel Git integration. Root Directory `apps/web`, Vite preset. Auto-deploys on merge to `main`.
- **party** → `.github/workflows/deploy-worker.yml` runs `wrangler deploy` on merge to `main` touching `apps/party` or `packages/shared`.
- **schema** → `supabase db push`, run manually for now.

## Secrets matrix

Nothing secret is committed. `.env.example` / `.dev.vars.example` mirror this table.

| Variable                    | Where it is set                                       | Consumed by              | Notes                                                       |
| --------------------------- | ----------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Vercel project env; `apps/web/.env.local` locally     | browser (`apps/web`)     | public                                                      |
| `VITE_SUPABASE_ANON_KEY`    | Vercel project env; `apps/web/.env.local` locally     | browser (`apps/web`)     | anon key only — RLS enforced                                |
| `VITE_SENTRY_DSN`           | Vercel project env; `apps/web/.env.local` locally     | browser (`apps/web`)     | optional; init no-ops when unset                            |
| `VITE_PARTY_HOST`           | Vercel project env; `apps/web/.env.local` locally     | browser (`apps/web`)     | worker host, e.g. `quiz-2027-party.<subdomain>.workers.dev` |
| `SUPABASE_URL`              | `wrangler secret put`; `apps/party/.dev.vars` locally | worker (`apps/party`)    | —                                                           |
| `SUPABASE_SERVICE_ROLE_KEY` | `wrangler secret put`; `apps/party/.dev.vars` locally | worker (`apps/party`)    | **never** in any `apps/web` env or client bundle            |
| `SUPABASE_JWKS_URL`         | `wrangler secret put`; `apps/party/.dev.vars` locally | worker (`apps/party`)    | verify user JWTs                                            |
| `SENTRY_DSN`                | `wrangler secret put`; `apps/party/.dev.vars` locally | worker (`apps/party`)    | optional; `withSentry` no-ops when unset                    |
| `CLOUDFLARE_API_TOKEN`      | GitHub Actions secret                                 | `deploy-worker.yml`      | scope: Workers Scripts:Edit                                 |
| `CLOUDFLARE_ACCOUNT_ID`     | GitHub Actions secret                                 | `deploy-worker.yml`      | —                                                           |
| `SUPABASE_ANON_KEY`         | GitHub Actions secret                                 | `supabase-keepalive.yml` | —                                                           |
| `SUPABASE_URL` (Actions)    | GitHub Actions secret                                 | `supabase-keepalive.yml` | same value as the worker secret                             |

## Free-tier limits

| Service                 | Free-tier limit that matters                                                                                                             | To exceed later      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Vercel Hobby            | non-commercial use; 100 GB bandwidth/mo                                                                                                  | Pro ($20/user/mo)    |
| Supabase Free           | 2 projects; pauses after ~7 days idle; 500 MB DB; 50k MAU                                                                                | Pro ($25/mo)         |
| Cloudflare Workers Free | 100k requests/day; **no `jurisdiction` for Durable Objects** (see Q-001); Durable Objects require the Workers Paid plan on some accounts | Workers Paid ($5/mo) |
| Sentry Developer        | 5k errors/mo; 1 user                                                                                                                     | Team ($26/mo)        |

## Open questions

- **Q-001** — is `.jurisdiction("eu")` available for SQLite Durable Objects on the
  Workers **Free** plan? Verified via `GET /__diag/jurisdiction` on the deployed
  worker; result recorded in `openspec/changes/scaffold-infra-wiring/proposal.md`
  and `SPEC.md`. Locally `workerd` has no jurisdiction support, so the worker
  falls back to unpinned routing in dev/tests.
- **Q-002** — domain not registered. Placeholder hosts (`*.vercel.app`,
  `*.workers.dev`) everywhere until it is.
