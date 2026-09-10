## Why

Quiz 2027 has approved requirements (`REQUIREMENTS.md` v1.1) and an architecture (`SPEC.md`), but no code, no repository structure, and no deployment pipeline. Nothing downstream — identity, event authoring, the real-time flow, scoring — can be built or demonstrated until the three platforms (Vercel, Supabase, Cloudflare Workers) are provisioned, wired together, and proven to deploy from `main`. This change is `SPEC.md` **MILESTONE-01** and is the prerequisite for every other milestone.

It also has to answer one open risk before the rest of the plan can rely on it: whether a SQLite-backed Durable Object can be pinned to the `eu` jurisdiction on the Cloudflare Workers **free** plan (`SPEC.md` Q-001). The scaffold is where that gets verified against the real platform rather than assumed.

## What Changes

- Introduce a pnpm-workspace monorepo: `apps/web` (Vite + React + TS + Tailwind + shadcn/ui SPA with the three route trees stubbed), `apps/party` (Cloudflare Worker running a `partyserver` Durable Object), `packages/shared` (framework-agnostic TS modules — the future home of scoring/timer/MCQ logic per NFR-017), and `supabase/` (CLI project: config + first empty migration).
- Provision the production platforms: one Supabase project (EU region), one Vercel project, one Cloudflare Worker — all on free tiers.
- Establish the **EventRoom** Durable Object skeleton: one instance per event id, namespace created through the `eu` jurisdiction, exposing a WebSocket endpoint that accepts a connection and echoes a message (no auth, no game logic yet).
- Establish the two-environment model (local, production) and the deploy pipeline: Vercel Git integration for `apps/web`; a GitHub Action running `wrangler deploy` for `apps/party`; `supabase db push` for schema. No staging.
- Wire Sentry into both the browser app and the Worker.
- Add a GitHub Actions scheduled workflow that pings Supabase every ~5 days to prevent free-tier auto-pause (NFR-003).
- Add repo hygiene: `.gitignore`, `.env.example` files, `.nvmrc` (Node ≥ 20.19 for the OpenSpec CLI and Wrangler), README with setup steps, conventional-commit and CI checks (typecheck, lint, build) on PRs.
- Record the outcome of the `eu`-jurisdiction-on-free-plan check (Q-001) in the change and, if it fails, surface the fallback decision rather than silently proceeding.
- No user-facing product behavior ships: the player, admin, and big-screen routes are placeholder shells.

## Capabilities

### New Capabilities

- `platform-foundation`: The deployment topology, environment model, and operational baseline of the system — the monorepo layout; the three hosted platforms and their free-tier constraints; EU data-residency configuration (Supabase EU region, Durable Object `eu` jurisdiction); the one-Durable-Object-per-event real-time transport skeleton and its WebSocket connect/echo contract; CI/CD from `main` to production for each surface; error tracking; and the keepalive that keeps the free-tier database reachable. Domain behavior (auth, events, scoring, …) is layered on this by later changes.

### Modified Capabilities

_None — greenfield; no existing specs._

## Impact

- **New:** entire repository structure; `apps/web`, `apps/party`, `packages/shared`, `supabase/`; root tooling (`pnpm-workspace.yaml`, TypeScript config, ESLint/Prettier, Vitest config); `.github/workflows/` (CI, worker-deploy, supabase-keepalive).
- **External services:** creates a Supabase project, a Vercel project, a Cloudflare Workers/Durable Objects namespace, and Sentry projects — all free tier. Requires the owner to hold accounts on all three and to provide API tokens as GitHub/Vercel secrets.
- **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (web), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `SENTRY_DSN` (worker) — established now, consumed by later changes.
- **Dependencies:** `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `partyserver`, `partysocket`, `wrangler`, `@sentry/react`, `@sentry/cloudflare`, `@supabase/supabase-js`, `vitest`, `@playwright/test`, `supabase` (CLI).
- **Blocks:** MILESTONE-02 (data model) and all subsequent milestones.
- **Open questions carried:** Q-001 (verified here), Q-002 (placeholder domain until registered).

## Implementation notes

### Q-001 result — EU jurisdiction on the Workers Free plan: **AVAILABLE**

Verified 2026-09-10 against the deployed worker `quiz-2027-party` (account `Andry CloudFlare`, no paid Workers subscription → Free plan):

- `GET https://quiz-2027-party.andry-cloudflare.workers.dev/__diag/jurisdiction` → `{"ok":true}` — `getServerByName(env.EventRoom, …, { jurisdiction: "eu" })` resolves and the DO responds.
- The Durable Object namespace `quiz-2027-party_EventRoom` reports `use_sqlite: true` (SQLite-backed, as required by the free plan and FR-082).
- WebSocket connect + echo confirmed against the deployed worker for a sample event id.

**Conclusion:** `.jurisdiction("eu")` **is** available for SQLite-backed Durable Objects on the Workers Free plan. The DO half of NFR-007 (EU residency) is **met**; no fallback to Workers Paid is needed for the PoC. `SPEC.md` Q-001 → Resolved.

(Local `workerd` still rejects `.jurisdiction()` — "not implemented in workerd" — so the worker keeps its unpinned-routing fallback for dev/tests only.)

### Q-009 — production database region (residency deviation)

The production Supabase project (`dehwczlcnmhmtfarrxnv`) was created in **`eu-west-2` (AWS London, United Kingdom)**, which is in Europe but **not in the EU**. `NFR-007` ("personal data stored only in the EU") is therefore **not strictly met** for the database half.

Owner decision (2026-09-10): **accept for the PoC** — test data only, UK holds an EU data-adequacy decision. Recorded as `SPEC.md` Q-009. Before any real personal data is processed, the project must be migrated to an EU-member region or UK adequacy reliance must be recorded in the registre des traitements.
