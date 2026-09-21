## Why

A live event currently has no way to finish: there's no "show the leaderboard" or "end the event" command, no final rankings are ever computed or persisted, and nothing stops the game from being mutated forever. This closes the flow-control lifecycle.

## What Changes

- **`mc:show_leaderboard`** (flow-controller only): recomputes cumulative rankings (reusing MILESTONE-08's `computeRankings`), sets `RoomState.display = "leaderboard"`, broadcasts both — the one command that broadcasts data *and* sets the display directive in one step.
- **`mc:end`** (flow-controller only, FR-065's "MC stop == end the event"): rejects unless the event is `live`; computes final individual/team totals; persists `event_final_participant`/`event_final_team` (existing MILESTONE-02 tables, no new migration) plus `event.status = 'ended'`/`ended_at`, via the same persist-then-retry pattern as `mc:reveal` (FR-083 explicitly requires the same retry treatment "at event end"). On success, reuses the existing `lastRankings` cache (MILESTONE-09 design.md D2) to hold the final totals, so a reconnecting screen sees the final podium data through the same mechanism already built — no new caching field. Does not force the display to "podium"; the Operator still chooses when via `operator:display`, matching SPEC.md's protocol table (`mc:show_leaderboard`'s row explicitly sets the display directive, `mc:end`'s does not).
- **"Permanently read-only" (FR-066)**: a real gap found while scoping — `mc:lock`, `mc:reveal`, and `answer:submit` have no `eventStatus` check today (never needed one; `eventStatus` was always `live` by the time a step could reach those states, since `mc:end` didn't exist). Adds an explicit `eventStatus === 'live'` guard to exactly these three — not to `operator:display`/`mc:claim_control`, which must stay usable after end so the Operator can still drive the screen to the final podium (FR-067). Also cancels any pending step-expiry alarm on `mc:end`, and guards the alarm's own lock path the same way, so a timer that was still running when the event ended can't sneak in a post-end mutation.
- **Team rankings on the big screen**: a second gap found while scoping — `ScreenViews.tsx`'s `LeaderboardView` (shared by the leaderboard and podium display views, built in MILESTONE-09) renders only `rankings.individuals`, never `rankings.teams`, despite FR-057 (MILESTONE-08) and FR-067 both requiring team standings too. Fixed as part of this milestone rather than worked around.
- **MC console**: two new buttons on `LiveControlPage.tsx` — show leaderboard, and end the event (with a confirmation prompt, matching the existing delete-event pattern, since ending is irreversible).
- **Player-facing polish**: a third gap — `OnboardingFlow.tsx`'s `JoinedView` only ever branches on `eventStatus` being `draft` or `live`; now that `ended` is reachable for the first time, a still-connected player would see a blank area below the joined header. Adds a minimal "the event has ended" player state (FR/EN).

## Capabilities

### Modified Capabilities
- `event-room`: adds `mc:show_leaderboard`, `mc:end`, the post-end write guards, and alarm cancellation on end.
- `big-screen`: the leaderboard/podium views now render team rankings alongside individual ones.
- `mc-console`: adds the show-leaderboard and end-event controls.
- `live-game`: adds the player's "event has ended" terminal state.

## Impact

- `apps/party/src/EventRoom.ts`: `handleMcShowLeaderboard`, `handleMcEnd`, `eventStatus === 'live'` guards on `handleMcLock`/`handleMcReveal`/`handleAnswerSubmit`, alarm cancellation on end.
- `packages/shared/src/protocol.ts`: `McShowLeaderboardCommand`, `McEndCommand`.
- `apps/web/src/routes/ScreenViews.tsx`: `LeaderboardView` renders `rankings.teams` too; `screenCopy.ts` gains labels.
- `apps/web/src/routes/admin/LiveControlPage.tsx` (+ `admin/copy.ts`): two new buttons.
- `apps/web/src/routes/player/OnboardingFlow.tsx` (+ `player/copy.ts`): an "event ended" terminal state.
- No new Postgres migration — `event_final_participant`/`event_final_team` already exist (MILESTONE-02) with admin-only-select RLS already in place; `EventEditorPage`'s existing `readOnly = event.status !== 'draft'` already correctly covers `ended` (verification only, no change expected there).
- Depends on MILESTONE-08 (`scoring-engine-persistence`, merged) and MILESTONE-09 (`big-screen-presentation`, merged).
