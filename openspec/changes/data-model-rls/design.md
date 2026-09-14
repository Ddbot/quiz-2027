## Context

MILESTONE-01 left `supabase/` with an empty schema (`0000_init.sql` is a comment-only migration) and a working local (`supabase start`) + production (linked, `db push`) pipeline. No application code reads Postgres yet — `apps/web` has no Supabase client wired in, and `apps/party`'s worker only has the `SUPABASE_*` secrets declared, unused. This change is the first real schema, so it also has to answer: how does a `profile` row come to exist for a new `auth.users` row, how do RLS policies check `is_admin` without a bespoke JWT claim, and — since MILESTONE-03 (auth flows) hasn't landed yet — how does this change's own RLS test suite and seed data get a player JWT and an admin JWT to test with.

See `proposal.md` — Why / What Changes for the full scope. Table shapes and RLS rules being implemented are SPEC.md §7.3 and §7.5, verbatim.

## Goals / Non-Goals

**Goals:**
- One migration that creates the full schema, constraints, RLS policies, and the supporting trigger/function it needs — applies cleanly from empty.
- An automated RLS test suite that proves the policies, using the project's existing test stack (Vitest) rather than a new tool.
- A way to get local player/admin JWTs for that suite and for local seeding, without waiting on MILESTONE-03's real auth UI.
- Admin promotion that satisfies FR-011 (no self-service path) without committing real admin emails to git.

**Non-Goals:**
- Any auth *UI* (anonymous sign-in screen, email/password forms) — that's MILESTONE-03.
- Wiring `apps/web` or `apps/party` to actually read/write this schema — later milestones.
- A `season_score` UI — SPEC.md says explicitly "read by no UI in the PoC."
- Performance tuning / indexing beyond what the constraints already imply — premature at PoC scale (10 concurrent).

## Decisions

### D1 — One migration for schema + constraints + RLS + trigger + admin-promote function

A single new migration (`supabase migration new data_model`) carries everything: the 12 tables/view, the partial-unique-live-event index, the per-step one-answer-per-participant constraint, RLS policies for every table, the `profile`-creation trigger (D2), and the admin-promotion function (D4). Rationale: nothing in this schema is useful partially applied — RLS without tables is meaningless and vice versa — and `0000_init` already established "one migration per meaningful unit" as the project's convention. Alternative (one migration per table) rejected: needless ceremony for a schema that lands atomically anyway.

### D2 — `profile` rows are created by an `auth.users` insert trigger

A `SECURITY DEFINER` trigger function on `auth.users` (`AFTER INSERT`) creates the matching `profile` row, copying `id`, `email` (NULL for anonymous), and `is_anonymous` from the new auth user, and defaulting `is_admin = false`. This is the standard Supabase pattern for "mirrors `auth.users`" (SPEC.md §7.3) and is the only path that creates a `profile` row — there is no client-writable insert policy on `profile`, so `is_admin` can never be set at signup (FR-011). Alternative (create `profile` rows from application code after signup) rejected: adds a race/consistency window and a second place client code could (even accidentally) set `is_admin`.

### D3 — RLS checks `profile.is_admin` directly, not a JWT claim

Policies use `EXISTS (SELECT 1 FROM profile WHERE id = auth.uid() AND is_admin)` rather than a custom JWT claim. Rationale: a JWT claim would only refresh on next token issuance, so promoting an admin (D4) wouldn't take effect until their next login/refresh — a plain table check is always current, and at PoC scale (two admins, ~10 concurrent players) the extra subquery per policy check is free. Alternative (custom claim via an `auth.jwt()` hook) rejected: more moving parts for a problem this scale doesn't have.

### D4 — Admin promotion is a `SECURITY DEFINER` function, invoked out-of-band, not a committed migration with real emails

The migration adds `app_promote_admin(target_email text)` (`SECURITY DEFINER`, `REVOKE EXECUTE FROM PUBLIC`, `GRANT EXECUTE TO service_role`), which sets `is_admin = true` on the `profile` row for the given email if one exists, and errors otherwise. The two real admin emails are **never committed** — the owner runs `select app_promote_admin('owner@example.com');` once via the Supabase SQL Editor (or `psql`) against local and again against production, after those two accounts already exist (REQUIREMENTS.md: "Admin accounts are created manually by the product owner"). README gets a short runbook for this. Rationale: keeps PII out of git history and matches "no self-service path" (FR-011) — the function is unreachable from any client role. Alternative (a data-seed migration with hardcoded emails) rejected: leaks the owner's email into a public repo forever; alternative (Supabase Studio manual UPDATE) rejected: not reproducible/auditable the way a named function call is.

### D5 — `season_score` is `security_invoker = true`, so it inherits `event_final_participant`'s RLS

Rather than writing a bespoke policy for the view, `CREATE VIEW season_score WITH (security_invoker = true) AS ...` makes every read run with the caller's own RLS, not the view owner's. Since `event_final_participant` is gated admin-only (D7's "administrative data" requirement), the view is transitively admin-only with zero extra policy code. Matches "read by no UI in the PoC" — nothing needs broader access yet, and loosening it later (e.g. a player reading their own season total) is a one-line policy add on the base table, not a view rewrite.

### D6 — RLS is tested with Vitest + `supabase-js` against the local stack, not pgTAP

A new workspace package, `tools/db`, holds:
- `src/adminClient.ts` — a `supabase-js` client using the local service-role key (read from `.env`/`SUPABASE_SERVICE_ROLE_KEY`, never committed)
- `src/testUsers.ts` — `createPlayer()` / `createAdmin()`: creates an `auth.users` row via the Admin API (email+password), and for `createAdmin()` also calls `app_promote_admin`; both then sign in and return `{ profile_id, accessToken }`
- `test/rls.test.ts` — the RLS suite (Vitest), asserting every scenario in `specs/data-model/spec.md` by making PostgREST calls through a `supabase-js` client scoped to each role's JWT (anon key + user access token) and checking success/denial

Rationale: `Vitest` is already the project's test runner (used by `packages/shared`, `apps/web`, `apps/party`); testing RLS through the same HTTP/PostgREST path the real app will use is a truer test than pgTAP's in-database `SET ROLE` simulation, and needs no new tool or language (pgTAP requires `pg_prove`/Perl tooling). Alternative (pgTAP via `supabase test db`) rejected: an additional toolchain for a project explicitly minimizing moving parts, for a test style (SQL-level) the app's actual clients (PostgREST over HTTPS) don't use anyway.

### D7 — Local seed fixtures are a script in `tools/db`, not `supabase/seed.sql`

`supabase/seed.sql` runs as plain SQL on `supabase db reset` — but a usable fixture (a draft event with participants) needs `auth.users` rows, which requires the Admin API, not raw SQL. `tools/db`'s `scripts/seed.ts` reuses the same `testUsers.ts` helpers (D6) to create a couple of local-only accounts and a draft event with participants, run manually after reset: `supabase db reset && pnpm --filter db seed`. `supabase/seed.sql` stays a comment-only placeholder (updated to point at the script) rather than attempting user creation in raw SQL. README's local-setup steps get this one extra command.

### D8 — `game_mcq` is admin-only for read, not just write

Unlike `event`/`step`/`team`, players never get a PostgREST read policy on `game_mcq` at all, at any event status — it holds `correct_option_id`, and a direct table read bypasses the timer/reveal logic entirely (a player could just query the answer). Question content reaches players exclusively through the real-time channel (the Durable Object, using the service-role key, which bypasses RLS and — in a later milestone — is responsible for stripping `correct_option_id` before broadcasting). Discovered while implementing task 2.3, which originally listed `game_mcq` as player-readable "public content"; `specs/data-model/spec.md` was corrected to match before the migration was written. This is a correctness fix, not a scope change — nothing in `SPEC.md` ever intended players to read the answer key directly.

## Risks / Trade-offs

- **`answer.option_id` can't be a real foreign key** (it must reference an entry inside `game_mcq.options` jsonb, and Postgres can't FK into JSONB) → accepted; option-id validity is checked at write time by whatever writes `answer` (the Durable Object, in a later milestone), not enforced by the schema. Documented here so it isn't mistaken for an oversight.
- **RLS bugs are security-critical and easy to get subtly wrong** → mitigated by the required D6 test suite; every scenario in `specs/data-model/spec.md` must have a passing (denial or success) assertion before this change is considered done.
- **CI doesn't currently run Supabase at all** → this change adds a step to `ci.yml` that runs `supabase start` (Docker is available on GitHub-hosted `ubuntu-latest` runners) before the RLS suite. First-run image pulls add a few minutes to CI; accepted since GitHub Actions minutes are free for a public repo and this only runs on PRs touching `supabase/` or `tools/db`.
- **Local dev now needs one extra manual step after `db reset`** (`pnpm --filter db seed`) instead of the previous implicit `seed.sql` auto-run → small workflow change, called out in the task list and README update.
- **The real admin-promotion invocation is a manual, undocumented-in-git step** → intentional (D4), but means a fresh clone can't reproduce "who is an admin" — that's the point (it's owner-specific data, not code).

## Migration Plan

1. Add the schema+RLS migration (D1–D5); `supabase db reset` applies it from empty locally.
2. Add `tools/db` (D6/D7): admin client, test-user helpers, RLS test suite, seed script.
3. Update `supabase/seed.sql` to a placeholder comment pointing at `pnpm --filter db seed`; update README's local-setup steps.
4. Add a CI step/job that runs `supabase start` then `pnpm --filter db test` (the RLS suite), gated the same way as the rest of the required `verify` check.
5. Owner runs `app_promote_admin('<email>')` once per real admin account against **local** (optional, for manual testing) and once against **production** via the Supabase SQL Editor — not committed, not automated.
6. `supabase db push` to the linked production project (same flow MILESTONE-01 already established).

No rollback beyond the usual `supabase db reset` locally / a follow-up migration in production (Postgres migrations here are additive-only for now; nothing in this change alters or drops MILESTONE-01's `0000_init`).
