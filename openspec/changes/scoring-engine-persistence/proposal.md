## Why

A step's answer window can close (MILESTONE-07's `mc:lock`/timer expiry), but nothing computes who was right, awards points, or tells anyone. Without scoring, the live flow has no stakes: players never learn their result, and no ranking exists for the big screen or admin to show later. This milestone closes that gap — the flow-controller can reveal a step's outcome, each player learns their own result, and running individual/team rankings become available for the rest of the event.

## What Changes

- New framework-agnostic scoring module (`packages/shared`, no Cloudflare/DO dependency per NFR-017): per-step scoring for untimed (all-correct) and timed (fastest-correct-only, tied on identical millisecond receipt time) steps; team per-step score as the mean of submitting members; step-winner team(s) and their award; zero-submitter/zero-answer handling; late-joiner eligibility (a participant scores only from the step active at the time they joined onward — determined by comparing `participant.joined_at` against each step's `timerStartedAt`, not the never-populated `participant.joined_at_position` column, see design.md).
- `mc:reveal` command on the EventRoom Durable Object (flow-controller only, `requireFlowController`-gated like every MILESTONE-07 command): runs the scoring module against the step's accepted answers (MILESTONE-07's local SQLite `local_answer` table), flushes `answer` (now with real `is_correct`/`scored_points`, correcting MILESTONE-07's explicit placeholder-avoidance deferral) and `step_result_participant`/`step_result_team` rows to Postgres with bounded retry so a transient Supabase failure never stalls the live flow, transitions the step to `revealed`, and broadcasts `step_results` (per-participant/per-team outcome) and `rankings` (event-cumulative totals, queried fresh from Postgres so a DO restart never desyncs them) to every connection, plus a private `own_result` to each player.
- `mc:reveal` requires the target step already be `locked` (explicitly or via timer expiry) — SPEC.md's FR-046 wording is ambiguous on this precondition; this proposal's interpretation is recorded in design.md.
- Player app (`apps/web`): `LiveGameView` (MILESTONE-07) gains a result view — correct/incorrect and points earned — shown once `own_result` arrives, replacing the holding view for that step.

## Capabilities

### New Capabilities
- `scoring`: the framework-agnostic per-step and cumulative scoring rules (points, team means, ties, eligibility, rankings) — pure logic, no persistence or transport concerns.

### Modified Capabilities
- `event-room`: adds the `mc:reveal` command — scoring trigger, Postgres flush with retry, `step_results`/`rankings`/`own_result` broadcasts, and the step's `locked → revealed` transition.
- `live-game`: the player's "holding view" requirement (MILESTONE-07: "disabled input, no result revealed") now has a terminal state beyond it — the player's own result, once revealed.

## Impact

- `packages/shared`: new `scoring.ts` (or similar) module + types; `RoomStep.status` already includes `"revealed"` (unused since MILESTONE-05, first real use here); `RoomState`/protocol messages gain `step_results`/`rankings`/`own_result` shapes.
- `apps/party/src/EventRoom.ts`: `mc:reveal` handler, a Postgres-flush-with-retry helper, rankings query.
- `apps/web/src/routes/player/LiveGameView.tsx` (+ copy, FR/EN): result view.
- No new Postgres migration — `answer`, `step_result_participant`, `step_result_team` already exist from MILESTONE-02 with the right columns/defaults/RLS (admin-only `select`; the DO writes via the service-role key, bypassing RLS).
- Depends on MILESTONE-07 (`live-mcq-round`, merged) for the local answer table, the active/locked step lifecycle, and the `requireFlowController` gating pattern this milestone's `mc:reveal` reuses.
