## Why

Quiz 2027 currently allows at most one event in `live` status system-wide (FR-027), enforced by a Postgres partial unique index. This was a deliberate v1 simplification — REQUIREMENTS.md §16 says so explicitly: *"The system runs one active event at a time in v1; the schema should carry an event scope on all event-bound data so multiple concurrent events can be enabled later without migration."* FR-028 made the same promise from the solution-architect side: every event-bound record already carries its event ID "so that concurrent events can be enabled later without data migration."

The owner now needs that later: the platform runs their company's events, and some nights they will host more than one simultaneously. This change relaxes FR-027 to deliver on that promise. As a side effect, it also removes the single largest source of this project's known CI test flakiness (`poc-validation-run/tasks.md` task 2.1) — two tests independently transitioning different events to `live` colliding on this same global constraint.

## What Changes

- **BREAKING** (spec-level, not data-level): FR-027 no longer holds. The system SHALL allow any number of events to be `live` simultaneously; there is no cap.
- Drop the `event_one_live_idx` partial unique index in a new migration. No data migration needed — every table is already event-scoped (FR-028), confirmed by re-reading `apps/party/src/EventRoom.ts` (one Durable Object per event id), `apps/web`'s admin console (already list-based and per-event: `EventListPage`, `LiveControlPage`/`ScreenRoute` keyed by `:eventId`), and every `status = 'live'` trigger/query in the schema (all scoped to `new.id`/`event_id`, never a global lookup).
- Update the two test suites that currently assert the old, now-reversed behavior: `tools/db/test/rls.test.ts`'s "At most one event is live at a time" test (flips to prove two events can both go `live` concurrently) and `apps/party/test/eventroom.test.ts`'s `afterEach` cleanup comment (the cleanup itself stays correct practice — good test isolation regardless of the constraint — but its comment currently explains releasing "the one live event slot" and should describe why cleanup still matters without implying a global lock).
- Extend `tools/harness` to prove two events can run fully live concurrently over real WebSocket connections, not just that the constraint is gone at the database level.
- Update `SPEC.md` (FR-027's text, the data-model section's index note, the Event glossary entry) and `openspec/specs/data-model/spec.md` (this proposal's delta) to reflect the new behavior. `REQUIREMENTS.md` is the owner's original document and is never edited.

## Capabilities

### Modified Capabilities

- `data-model`: the "At most one event is live at a time" requirement is replaced by a requirement stating multiple events may be concurrently live, with no system-wide cap.

## Impact

- `supabase/migrations/`: one new migration dropping `event_one_live_idx`.
- `tools/db/test/rls.test.ts`: the existing single-live-event test is rewritten to prove the opposite.
- `apps/party/test/eventroom.test.ts`: `afterEach` cleanup comment updated (behavior unchanged — cleanup remains correct practice for test isolation).
- `tools/harness/`: extended to run two events live at once as part of its scripted scenario.
- `SPEC.md`, `openspec/specs/data-model/spec.md`: FR-027 and the "at most one live event" requirement updated.
- No changes to `apps/party/src/EventRoom.ts`, `apps/web`'s routing/admin console, or any RLS policy — all already event-scoped.
