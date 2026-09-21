## Context

Everything this milestone needs already exists in the schema (`supabase/migrations/20260914120108_data_model.sql`, MILESTONE-02): `profile.display_name`/`email`/`deleted_at`/`is_anonymous`, `participant.display_name`/`profile_id` (`unique (event_id, profile_id)`), `team.captain_participant_id` (FK to `participant`, no `on delete` clause — defaults to `RESTRICT`), and cascading deletes already in place from `answer`/`step_result_participant`/`event_final_participant` down to `participant`. `event.ended_at` is written once, at `mc:end` (MILESTONE-10, `apps/party/src/EventRoom.ts`'s `handleMcEnd`). `season_score` (also MILESTONE-02) already aggregates per `profile_id`/`season_year` from `event_final_participant`, filtered to non-anonymous, non-deleted profiles — nothing here changes that view or its access.

## Goals / Non-Goals

**Goals:**
- `export_my_data`/`delete_my_account` that behave exactly as SPEC.md's REST table describes, reusing the existing security-definer-with-explicit-check RPC pattern.
- A 90-day anonymous purge that runs on its own, with no external secret exposure beyond what already exists.
- A minimal but real account page — not just the RPCs sitting unreachable.

**Non-Goals:**
- FR-080 (season detail archival at close) — explicitly out of scope per SPEC.md (assumed commercial phase, Q-007).
- Any change to `season_score` itself, or exposing it anywhere — FR-076 still holds.
- Deleting the underlying `auth.users`/`profile` row entirely on account deletion — see D1.

## Decisions

### D1: `delete_my_account` purges the caller's own `profile` row in place; it does not fabricate a separate "sentinel" profile

SPEC.md's REST table describes this as rewriting `participant.display_name`/`profile_id` "to an anonymised sentinel." Taken completely literally — one shared sentinel profile every deleted account's participants get repointed to — this breaks the moment two different deleted accounts both played the same event: `participant`'s `unique (event_id, profile_id)` constraint would then have two rows both wanting `(that event_id, the one shared sentinel profile_id)`, which Postgres rejects outright. A fresh, one-off sentinel profile per deletion would dodge that, but `profile.id references auth.users(id)` — creating one would mean fabricating a new `auth.users` row too, which needs the Supabase Auth Admin API, not plain SQL a Postgres function can issue on its own.

Purging the caller's own profile row in place — clear `display_name`/`email`, set `deleted_at`, leave `participant.profile_id` pointed at that same (now-identity-free) profile — reaches the identical substantive outcome the requirement is actually after: the score rows survive, and nothing about them points at any remaining identifying information. It needs no new row, no Admin API call, and no risk of colliding with another deleted account's data. `participant.display_name` is still rewritten to a fixed placeholder, exactly as specified.

### D2: The 90-day purge is a `pg_cron` job, not a GitHub Actions cron

`pg_cron` is available in this project's Postgres (confirmed: `pg_available_extensions` lists it, not yet installed) and is Supabase's own documented pattern for exactly this kind of retention job — it runs inside Postgres on its own schedule, calling a plain `security definer` function with no API key involved at all. The alternative — a GitHub Actions scheduled workflow (this project already has one, `supabase-keepalive.yml`) hitting a privileged RPC over REST — would need the Supabase **service-role key** as a GitHub Actions secret. That key is currently held only as a Cloudflare Worker secret (`apps/party`'s own DO-to-Postgres writes); duplicating it into a second secret store is exactly the kind of security-boundary change that isn't this milestone's call to make unilaterally. `pg_cron` sidesteps the question entirely.

The purge function itself (`purge_expired_anonymous_participants()`) is granted to no client-facing role at all (not even `authenticated`) — only `cron.schedule` ever invokes it, from inside Postgres.

### D3: The purge deletes the `participant` row outright; it does not anonymise in place

Unlike `delete_my_account` (D1), which anonymises because the requirement explicitly wants scores *retained*, FR-079 for anonymous participants lists exactly what gets purged — "display name, answers, and per-step and total scores" — with no retention clause. `season_score` already excludes anonymous profiles entirely (`where p.is_anonymous = false`), so there is nothing later that would ever need an anonymous participant's now-purged scores. A single `delete from participant where …` cascades to `answer`/`step_result_participant`/`event_final_participant` for free via their existing FKs — one statement covers the whole list. The one wrinkle: `team.captain_participant_id` has no `on delete` clause (defaults to `RESTRICT`), so an affected participant who was a team captain would otherwise block their own deletion — the function nulls that column first for any team they still captain.

### D4: The account page lives at `/account`, linked from the root join-code landing page

There is currently no persistent "signed in" navigation anywhere in the player-facing app — a player's whole journey is join-code-driven. The root landing page (`JoinCodeLandingRoute.tsx`) is the one place a returning account holder is likely to land without an event context already in hand, so it gains a conditional link (shown only when `useAuth()` reports a session) to `/account`. The account page itself needs no event context at all — export/delete both operate on the caller's identity alone.

## Risks / Trade-offs

- [`delete_my_account` deviates from SPEC's literal "sentinel profile" phrasing] → Documented in D1; the substantive privacy outcome (scores retained, unlinked from any remaining identity) is identical, and the literal reading is unsafe given the existing uniqueness constraint.
- [A currently-live event straddling this migration's deploy has no `ended_at` yet for the purge to key off] → No different from any other retention rule — it only ever applies from `ended_at` onward, so nothing is purged prematurely; nothing purges too early either.
- [`pg_cron`'s daily schedule means a purge could run up to ~24h later than exactly 90 days] → Acceptable; FR-079 doesn't require purge-to-the-second precision, and the existing `supabase-keepalive.yml` cron already establishes this project's tolerance for day-granularity scheduling.

## Migration Plan

One new Postgres migration: `export_my_data`, `delete_my_account`, `purge_expired_anonymous_participants()`, `create extension if not exists pg_cron` plus its `cron.schedule(...)` registration. No new tables or columns, no backfill, no destructive change to existing data. Deploys the same way every prior milestone's migration has.
