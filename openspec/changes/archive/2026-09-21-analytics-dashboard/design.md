## Context

Two schema columns from MILESTONE-02 (`supabase/migrations/20260914120108_data_model.sql`) have sat unused since: `participant.joined_at_position int not null default 0` and `event.current_step_id uuid` / `step.timer_started_at timestamptz`. Nothing in the codebase has ever written to any of them — `EventRoom.ts`'s `handleMcStart`/`handleMcAdvance` only ever update `event.status`/`season_year` in Postgres (plus, later, `step.status = 'revealed'` at `mc:reveal` time); the Durable Object's own in-memory/persisted `RoomState` is the sole live source of truth for "what step is current," never synced back to Postgres in between. `join_event` (`…join_event.sql`) creates `participant` rows with none of this context.

`event_final_participant`/`event_final_team` (MILESTONE-10) already hold the final rankings this dashboard needs to display, and `answer`/`step_result_participant`/`step_result_team` (MILESTONE-08) already hold everything needed for per-question and completion-rate figures — once the two columns above are actually populated.

## Goals / Non-Goals

**Goals:**
- Make `event.current_step_id`/`step.timer_started_at` and `participant.joined_at_position` genuinely correct, not just present in the schema.
- A `completion_rate` definition that produces the same number a human would get by hand-counting the fixture event described in SPEC.md's acceptance criteria.
- Keep the fix minimal: only the two fields FR-072/FR-073 actually need get wired up.

**Non-Goals:**
- Syncing `step.status` transitions (`active`/`locked`) to Postgres in general — only its activation timestamp is needed here, not a full mirror of the Durable Object's step state machine.
- Any change to how `event_final_*`/`answer`/`step_result_*` are computed or persisted — this milestone only reads them.
- Editing or exporting dashboard data (GDPR/export flows are MILESTONE-13).

## Decisions

### D1: `join_event` is changed in place via `create or replace function`, in a new migration

`join_event`'s signature (`p_join_code, p_display_name, p_over16_ack, p_marketing_consent`) doesn't change — only its body, to additionally read `event.current_step_id` and resolve it to a `step.position` (or `0` if `current_step_id is null`, i.e. the event hasn't started) when — and only when — the INSERT branch actually creates a new `participant` row. `create or replace function` with an unchanged signature is the standard, safe way to evolve a Postgres function across migrations (every RPC in this project has had its full body live in the migration that created it; this is the first one a later milestone needs to touch). The existing "already joined" branch is untouched, so a returning participant's `joined_at_position` is never overwritten — it was set once, correctly, at their original insert.

Alternative considered: compute `joined_at_position` lazily inside `event_dashboard` itself, from some other signal (e.g. the participant's first `answer.submitted_at`). Rejected — a participant who joins late and never answers anything would have no signal at all, and "present from their join step onward" per FR-073 is explicitly about *when they joined*, not when they first answered.

### D2: `mc:start`/`mc:advance` write `event.current_step_id`/`step.timer_started_at` as a second, small Postgres write alongside their existing one

`handleMcStart` already does one `event` update (`status`, `season_year`); this becomes `{ status, season_year, current_step_id }`, still one round trip. `handleMcAdvance` currently makes no `event`-level Postgres write at all — it gains one. Both also set the new step's `step.timer_started_at` (a `step` update, alongside computing the same `timerStartedAt` value the Durable Object was already putting in `RoomState.step.timerStartedAt` for every step, timed or not — this was already computed, just never persisted). These writes happen unconditionally when the in-memory transition itself succeeds (inside the existing `if (changed)` block), matching the project's established "only persist on true state change" convention elsewhere in this file.

Alternative considered: have `event_dashboard` (or `join_event`) ask the Durable Object directly instead of reading Postgres. Rejected — a Postgres RPC has no path to reach a Durable Object, and the entire rest of this system's design keeps Postgres as the durable system of record specifically so nothing besides the DO itself ever needs to reach into Cloudflare's runtime.

### D3: `completion_rate` is a ratio of sums, using `step.status = 'revealed'` as "this step has happened"

`sum(participant's submitted answer count) / sum(count of revealed steps with position >= participant.joined_at_position)`, across every participant. Using `revealed` (not "every step in the event") means an in-progress event's dashboard never penalizes anyone for steps that haven't happened yet — the acceptance criterion's fixture event is implicitly a finished one (every step revealed), where this coincides with counting every step from each participant's join point. A zero denominator (viewed before any step has been revealed) returns `0` rather than dividing by zero.

### D4: `avg_response_ms` is one event-wide number, not per-question

FR-072 lists "average response time" as its own dashboard field, distinct from the explicitly-labeled *per-question* correct/incorrect breakdown — read literally, it's a single aggregate: the mean of `answer.submitted_at - step.timer_started_at` (milliseconds) across every persisted `answer` row for the event, regardless of which step. `step.timer_started_at` (D2) is exactly the anchor this needs and didn't exist before now for any step.

### D5: The dashboard counts hidden participants/teams; MILESTONE-11's `hidden` flag stays scoped to big-screen views

FR-071 (MILESTONE-11) excludes hidden participants/teams specifically from *big-screen* views — an audience-facing concern. The dashboard is a separate, admin-only surface an organizer uses to understand what actually happened, including anyone they had to moderate; excluding them here would make the dashboard's own numbers (participant count, completion rate) silently wrong. `final_participants`/`final_teams` likewise include hidden entities, matching `event_final_*`'s own unfiltered persistence (MILESTONE-10 never filtered those tables — only the live broadcast messages).

### D6: `event_dashboard` is a `security definer` function with an explicit `is_admin()` check

Matches every other RPC in this project (`create_team`, `moderate_participant`, `join_event`, …) rather than relying solely on the underlying tables' RLS SELECT policies (which, for `answer`/`step_result_*`, are already admin-inclusive — see `data-model`'s existing "readable only by an admin identity" requirement — but an explicit check keeps this RPC's authorization self-contained and consistent with its siblings, not dependent on which policy happens to cover which table it joins).

### D7: The dashboard is its own console page, linked from `EventEditorPage`, not folded into `LiveControlPage`

`LiveControlPage` is the live, WebSocket-driven flow-control + moderation surface (event-room-backed); the dashboard is a one-shot PostgREST read with nothing time-sensitive about it, and stays meaningful long after an event has ended — closer in spirit to `EventEditorPage` itself than to the live console. A new route (`/admin/events/:eventId/dashboard`) keeps each page's concerns separate, mirroring the existing `liveControlLink` pattern.

## Risks / Trade-offs

- [A currently-live event (mid-rollout of this migration) has participants who joined before `join_event`'s new behavior existed, so their `joined_at_position` stays `0` even if they actually joined late] → Accepted: this is a one-time transition gap affecting only events straddling the deploy, not a systemic correctness issue; every event created after deploy is unaffected. Not worth a backfill for a zero-cost proof-of-concept with no events in flight at deploy time.
- [`step.timer_started_at` being written slightly after the in-memory transition (network round trip to Postgres) means it's not bit-exact with what a client sees] → Already true of every other Postgres write this Durable Object makes (e.g. `mc:reveal`'s persist-then-broadcast); the dashboard's average response time is a coarse aggregate, not a per-answer precision guarantee.

## Migration Plan

One new Postgres migration: `create or replace function public.join_event(...)` (unchanged signature, extended body) plus the new `event_dashboard` function. No destructive change, no backfill. Deploys the same way every prior milestone's migration has.
