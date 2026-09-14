## Why

MILESTONE-01 provisioned an empty Supabase project (schema is a single empty migration). Every later milestone — auth & onboarding, event authoring, the live flow, scoring — needs real tables to read and write, and needs those tables protected by row-level security before any client (anonymous player, account holder, or admin) can be trusted to talk to Postgres directly. This change lands the full data model from `SPEC.md` §7.3 and the RLS policy set from §7.5 so there is an enforced access-control boundary in place before application code exists to (accidentally or otherwise) rely on its absence.

## What Changes

- Add all tables and the `season_score` view from `SPEC.md` §7.3: `profile`, `event`, `step`, `game_mcq`, `team`, `participant`, `answer`, `step_result_participant`, `step_result_team`, `event_final_participant`, `event_final_team`, `season_score` (view).
- Add the partial unique index enforcing at most one `event` with `status = 'live'` at a time.
- Add RLS policies per §7.5's role-based model: a player can read their own `participant` row and public event/team/step content for events they're part of; content tables (`event`, `step`, `game_mcq`, `team`) become read-only to non-admins once `event.status <> 'draft'`; admin-only data and all writes to content tables are gated on `profile.is_admin`; no table is readable or writable by an unauthenticated (non-JWT) request.
- Add a `supabase/seed.sql` with local-dev fixture data (a draft event with a few participants) so `supabase db reset` leaves a usable local database.
- Add a one-off, idempotent SQL script/migration step that flags exactly two named accounts as `profile.is_admin = true` (SPEC.md §7.5: "no self-service route to admin").
- Add an automated RLS test suite proving: a player JWT cannot read another participant's row, cannot write any content table, and cannot read admin-only data; an admin JWT can.

## Capabilities

### New Capabilities

- `data-model`: the Postgres schema (tables, view, constraints) and row-level-security access-control model that is the system of record for events, teams, participants, answers, and results. Defines what each role (anonymous/unauthenticated, player, admin) may read and write directly against Postgres, independent of any application code.

### Modified Capabilities

_None — `platform-foundation`'s requirements (deployment topology, environments, CI/CD, residency) are unaffected; this change only adds a schema on top of the Supabase project it already provisions._

## Impact

- **New:** `supabase/migrations/<next>_data_model.sql` (schema + RLS), `supabase/seed.sql` (local fixtures), an admin-flagging script, and an RLS test suite (approach decided in design.md).
- **Unaffected:** `apps/web` and `apps/party` don't read this schema yet — no application code consumes it until MILESTONE-03 (Auth & onboarding) and beyond. This change is Supabase-only.
- **Blocks:** MILESTONE-03 (Auth & onboarding), which needs both the schema and its RLS policies to exist.
- **Dependencies:** none beyond MILESTONE-01 (Supabase project, migration pipeline) already in place.
