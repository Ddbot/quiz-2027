## Why

An organizer running an event has no way to see how it actually went — no participant count, no sense of how many people kept answering, no per-question breakdown, no confirmation of the final standings — without querying Postgres by hand. MILESTONE-12 is the first milestone where its one dependency (MILESTONE-10's final rankings) is in place.

## What Changes

- A new admin-only `event_dashboard` RPC (SPEC.md §7.4.1): participant count, completion rate, per-question correct/incorrect breakdown, average response time, and final individual + team rankings — never a player email, at any level.
- Completion rate is defined precisely (FR-073): the ratio of total answers submitted to the total number of *revealed* steps each participant was actually present for, summed across every participant (not a per-participant average) — so a late joiner's earlier, unreachable steps don't count against them.
- Two real, previously-unwired schema columns get put to use, since FR-073/FR-072 both depend on them:
  - `participant.joined_at_position` (existed since MILESTONE-02, never set): now stamped once, at `join_event`'s INSERT, from whatever step is current when someone joins.
  - `event.current_step_id` / `step.timer_started_at` (existed since MILESTONE-02, never written): `EventRoom`'s `mc:start`/`mc:advance` now keep these synchronized in Postgres as each step becomes active — the only way `join_event` can know "what step is current" at insert time, and the basis for the dashboard's average response time.
- A new admin console page (`/admin/events/:eventId/dashboard`), linked from the event editor, rendering all of the above.

## Capabilities

### New Capabilities
- `analytics`: the per-event analytics dashboard — the `event_dashboard` RPC's contract and the console page that renders it.

### Modified Capabilities
- `data-model`: `join_event` now stamps `participant.joined_at_position` at insert time; `event.current_step_id`/`step.timer_started_at` are kept synchronized as steps become active (new requirement — previously true of neither field).

## Impact

- `supabase/migrations/`: one new migration (`event_dashboard` RPC; no new columns — both fields it depends on already exist).
- `supabase/migrations/…join_event.sql`'s `join_event` function: not rewritten as a new migration file, but its *behavior* changes via the new migration (a `create or replace function`) — see design.md for why this is safe.
- `apps/party/src/EventRoom.ts`: `handleMcStart`/`handleMcAdvance` gain a Postgres write for `event.current_step_id`/`step.timer_started_at`.
- `apps/web/src/routes/admin/`: new `DashboardPage.tsx` + route + link from `EventEditorPage`.
