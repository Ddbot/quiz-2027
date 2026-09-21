## Context

See proposal.md for motivation/scope. Relevant existing state (`apps/party/src/EventRoom.ts`, unchanged this milestone except where noted):

- `computeRankings(roster)` (MILESTONE-08) already aggregates every `step_result_participant`/`step_result_team` row for the event into a ranked `RankingsMessage` — exactly the shape `event_final_participant`/`event_final_team` need (`total`→`total_points`/`total_awarded`, `rank`→`rank`), so `mc:end` reuses it directly rather than re-deriving totals.
- `withRetry` (MILESTONE-08) and the persist-then-transition pattern (`mc:reveal`) are the established template for any command that must durably commit before mutating `RoomState`/broadcasting.
- `RoomState.lastRankings` (MILESTONE-09 design.md D2) already exists specifically to let a reconnecting client see the current cumulative standings without a replay — reused as-is for the *final* standings after `mc:end`, since it's the same shape and the same "current, not stale" guarantee.
- `event_final_participant`/`event_final_team` (MILESTONE-02) already exist with admin-only-select RLS; the DO's service-role client bypasses RLS for the write, same as every other DO→Postgres write.
- `EventEditorPage.tsx`'s `readOnly = event.status !== 'draft'` (MILESTONE-04) already treats `live` and `ended` identically — verified, not changed, for FR-066's "read-only in UI" half.

## Goals / Non-Goals

**Goals**: a flow-controller can show the leaderboard on demand and end the event, computing and durably persisting final rankings; nothing can mutate game progress after an event has ended; the big screen's leaderboard/podium show team standings, not only individual ones.

**Non-Goals**: `mc:kill_switch` (MILESTONE-11); GDPR purges/season aggregation (MILESTONE-13); the scripted 10-client validation harness (MILESTONE-15); retroactively syncing `event.current_step_id`/`step.status` to Postgres for `active`/`locked` (a pre-existing gap noted since MILESTONE-08, still not this milestone's job — `mc:end` only ever needs `event.status`/`ended_at`, not the step-level Postgres columns).

## Decisions

### D1: `mc:end` reuses `computeRankings`'s output directly as the final-rankings source

`computeRankings(roster)` already returns exactly `{ individuals: [{participantId, displayName, total, rank}], teams: [{teamId, name, total, rank}] }` — `total`/`rank` map 1:1 onto `event_final_participant.total_points`/`.rank` and `event_final_team.total_awarded`/`.rank`. No separate aggregation is written; `mc:end` calls the same method `mc:reveal` already calls, then shapes its two arrays into upsert payloads.

**Alternative considered**: a dedicated SQL aggregate query (or Postgres RPC) computing final totals directly in the database. Rejected — `computeRankings`'s existing JS-side aggregation is already correct, already tested, and operates at this project's PoC scale (≤10 participants); introducing a second computation path for the same numbers risks the two disagreeing, which a shared method structurally can't.

### D2: `mc:end` is persist-then-transition, exactly like `mc:reveal` (design.md D4, MILESTONE-08)

Final rankings are computed in memory, then `event_final_participant`/`event_final_team` rows plus `event.status = 'ended'`/`ended_at` are written via the same bounded-retry `withRetry` helper. Only on success does `RoomState` mutate (`eventStatus: 'ended'`, `lastRankings` set to the final totals) and broadcast happen. On exhausted retries, the controller receives an `end_failed` error and the event stays `live` — retryable by sending `mc:end` again, with nothing broadcast to anyone else in the meantime. This is the same shape as `mc:reveal`'s already-tested failure path, reused rather than re-invented.

### D3: Exactly three handlers gain an `eventStatus === 'live'` guard; `operator:display`/`mc:claim_control` deliberately do not

`mc:lock`, `mc:reveal`, and `answer:submit` never needed an `eventStatus` check before this milestone, because `eventStatus` was always `live` by the time a step could reach `active`/`locked` (nothing before `mc:end` existed could ever set it to anything else mid-game). Now that `mc:end` can transition to `ended` while `RoomState.step` may still show a stale `active`/`locked` status (the controller ended the event mid-question), these three would otherwise still succeed post-end — a direct violation of FR-066. `operator:display` and `mc:claim_control` are deliberately left unguarded: FR-067 requires the Operator to still be able to drive the screen to the final podium after the event has ended, and re-claiming control post-end is harmless (it changes nothing but who may issue the now further-guarded commands, all of which remain rejected regardless of who holds control).

### D4: A pending step-expiry alarm is cancelled on `mc:end`, and the alarm's own lock path is guarded the same way

If the controller ends the event while a timed step is still `active` (never locked), that step's expiry alarm may still be scheduled. Without a guard, it would fire after `mc:end` and call `lockCurrentStepIfActive()`, mutating `RoomState.step.status` to `locked` and broadcasting — a post-end mutation, even though it can never itself be revealed (`mc:reveal` is now guarded too). Fixed two ways, both defensive: `mc:end` calls `ctx.storage.deleteAlarm()` on success (the common case — no alarm ever fires), and `lockCurrentStepIfActive()` itself (shared by both the explicit `mc:lock` command and the alarm) now also checks `eventStatus === 'live'` before mutating (the race-window case — an alarm already in flight when `mc:end` runs). The explicit `mc:lock` command handler still sends its own `not_live` error to the caller for clear feedback; the alarm path has no connection to notify and silently no-ops, matching the existing idempotent-no-op convention for stale alarms (design.md D3, MILESTONE-07).

### D5: `mc:show_leaderboard` always recomputes and re-broadcasts, even if the display was already "leaderboard"

Unlike `mc:claim_control`'s "no-op if you already hold it" idempotency, repeating `mc:show_leaderboard` is a meaningful "refresh the standings now" action each time — cumulative totals may have changed since the display was last set to leaderboard (e.g., a step was revealed in between). It therefore always recomputes rankings and always broadcasts, rather than short-circuiting via `applyMutation`'s reference-equality check the way most other commands do.

### D6: The leaderboard/podium view extension changes only rendering, not the wire shape

`RankingsMessage`/`RoomRankings` have always carried `teams`, populated since MILESTONE-08 — `ScreenViews.tsx`'s `LeaderboardView` simply never rendered that array. No protocol change; this milestone only adds a `teams` section to the existing component (with its own heading, omitted entirely when the event has no teams — avoids a confusing empty section for a solo-only event rather than requiring new "no teams" copy).

## Risks / Trade-offs

- [Risk] `mc:end`'s persisted `event_final_*` rows and the live `RoomState.lastRankings` it sets could disagree if a `step_result_*` row were written between `computeRankings()` being called and the `event_final_*` write succeeding → Mitigation: accepted as effectively impossible at this project's scale — nothing else can write `step_result_*` once `mc:end` has begun (every step-mutating command is now guarded to `eventStatus === 'live'`, and `mc:end` itself is the only thing that can flip that away from `live`), so there's no concurrent writer to race against.
- [Risk] The alarm-cancellation fix (D4) can't be exercised as a real integration test the same deterministic way MILESTONE-07's alarm tests were (waiting on real wall-clock time is slow and this is a narrow edge case) → Mitigation: acceptable — covered by a test that manually invokes the alarm path after `mc:end` (mirroring MILESTONE-07's `onAlarm`-called-directly convention) rather than waiting on a real timer.

## Migration Plan

1. `packages/shared`: `protocol.ts` gains `McShowLeaderboardCommand`, `McEndCommand`.
2. `apps/party`: `EventRoom.ts` — `handleMcShowLeaderboard`, `handleMcEnd`, the three `eventStatus === 'live'` guards, `lockCurrentStepIfActive`'s own guard, alarm cancellation on end.
3. `apps/party/test/eventroom.test.ts`: extend with `mc:show_leaderboard`/`mc:end` scenarios, the three post-end rejection tests, and the alarm-after-end no-op test.
4. `apps/web`: `ScreenViews.tsx`'s `LeaderboardView` gains team rendering; `LiveControlPage.tsx` gains the two new buttons; `OnboardingFlow.tsx` gains the "event ended" player state. New copy in `screenCopy.ts`/`admin/copy.ts`/`player/copy.ts`.
5. No new Postgres migration.
6. Rollback: additive to `apps/party`/`apps/web`/`packages/shared` only — a plain `git revert`; no data migration.

## Open Questions

None — the three scoping gaps found while designing this (permanently-read-only guards, big-screen team rankings, the player's ended-state) are each resolved above rather than left open.
