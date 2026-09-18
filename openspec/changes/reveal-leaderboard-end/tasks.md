## 1. `packages/shared`: protocol additions

- [x] 1.1 `protocol.ts`: `McShowLeaderboardCommand extends ClientCommand { type: "mc:show_leaderboard" }`, `McEndCommand extends ClientCommand { type: "mc:end" }` — verify `pnpm --filter @quiz/shared typecheck` and the isolation check pass.

## 2. `apps/party`: `mc:show_leaderboard` and `mc:end`

- [x] 2.1 `mc:show_leaderboard` handler: `requireController` gate; rejects `not_live` when the event isn't live; recomputes rankings (`computeRankings`), sets `display: "leaderboard"`, persists, broadcasts `state` + `rankings` — always recomputes/broadcasts even if display was already "leaderboard" (design.md D5) — verify tests for the happy path, a non-controller rejection, and a repeated call re-broadcasting (not a silent no-op).
- [x] 2.2 `mc:end` handler: `requireController` gate; rejects `not_live` when the event isn't live (draft or already ended); computes final individual/team totals via `computeRankings` (design.md D1); persists `event_final_participant`/`event_final_team` (upsert, matching `mc:reveal`'s pattern) plus `event.status = 'ended'`/`ended_at`, via `withRetry` (design.md D2); on success sets `RoomState.eventStatus = 'ended'` and `lastRankings` to the final totals, persists, broadcasts `state` + `rankings`; on exhausted retries sends `end_failed` and leaves the event `live` — verify tests for the happy path (asserting real `event_final_*` Postgres rows and `event.status`/`ended_at`), a non-controller rejection, a not-live rejection, and an exhausted-retries test. **Note**: the deterministic-failure fixture differs from `mc:reveal`'s (a dangling participant FK) since `mc:end`'s roster is always freshly read from Postgres, leaving no equivalent stale reference to exploit — instead simulates a concurrent modification by flipping the event's real Postgres `status` away from `"live"` directly (out from under the DO's in-memory view), so the final `event` update's `.eq("status","live")` guard genuinely and deterministically matches 0 rows on every retry.
  **Side effect noted while implementing**: `mc:reveal`'s new `eventStatus === 'live'` guard changed one pre-existing MILESTONE-08 test's expected error code (a reveal attempt on a never-started/draft event now correctly reports `not_live` before it would even reach the old `not_locked` check) — updated that test's expectation, not a regression.

## 3. `apps/party`: permanently-read-only guards

- [x] 3.1 `mc:lock`, `mc:reveal`, and `answer:submit` each reject once `eventStatus !== 'live'` (design.md D3) — verify one test per handler: end the event, then send that command, asserting rejection and no state mutation.
- [x] 3.2 `lockCurrentStepIfActive` itself also guards on `eventStatus === 'live'` (design.md D4, covers the alarm path, not only the explicit `mc:lock` command) — verify a test that manually invokes `onAlarm()` after `mc:end` (mirroring MILESTONE-07's direct-`onAlarm()`-call convention) and asserts the persisted state is unchanged.
- [x] 3.3 `mc:end` cancels any pending step-expiry alarm on success (design.md D4) — verify a test asserting `ctx.storage.getAlarm()` returns null after `mc:end` succeeds while a timed step was still active.
- [x] 3.4 `operator:display` and `mc:claim_control` remain usable after the event has ended (design.md D3) — verify a test sending `operator:display` after `mc:end` and asserting it still succeeds. `mc:claim_control` needs no dedicated test: it received no new guard at all this milestone (design.md D3 deliberately excludes it), so its existing MILESTONE-05 tests already cover its behavior, unaffected by anything ending has to do with it.

## 4. `apps/web`: big screen — team rankings

- [x] 4.1 `ScreenViews.tsx`'s `LeaderboardView` renders `rankings.teams` alongside `rankings.individuals`, for both the leaderboard and podium display views, omitting the teams section entirely when the event has no teams (design.md D6) — verify a test asserting both sections render when both exist, and that the teams section is absent (not an empty placeholder) when there are none. **Bug found in a pre-existing MILESTONE-09 test while verifying this**: "the podium view shows no team name" asserted `queryByText("Team A")` (exact match) — since team entries render as `"#{rank} {name}"` (e.g. `"#1 Team A"`), that exact-match assertion never actually matched even when a team name genuinely was on screen, so the test was accidentally passing for the wrong reason both before and immediately after this change. Replaced with regex-matched assertions (`/Team A/`, matching the existing convention already used for the leaderboard's individual-name test) that actually exercise what they claim.
- [x] 4.2 New FR/EN copy for the section labels (`screenCopy.ts`) — verify no hardcoded copy remains inline.

## 5. `apps/web`: MC console

- [x] 5.1 "Show leaderboard" button on `LiveControlPage.tsx` sending `mc:show_leaderboard`, enabled only while the caller holds control of a live event — verify a test asserting the command shape.
- [x] 5.2 "End the event" button sending `mc:end` only after an explicit confirmation (`window.confirm`, matching `EventEditorPage`'s existing delete-event pattern), enabled only while the caller holds control of a live event — verify a test asserting no command is sent when confirmation is declined, and the command shape when confirmed.
- [x] 5.3 New French copy for both controls and the confirmation prompt — verify no hardcoded copy remains inline.

## 6. `apps/web`: player-facing "event ended" state

- [x] 6.1 `OnboardingFlow.tsx`'s `JoinedView` shows a minimal "the event has ended" state once `effectiveStatus === "ended"`, replacing the team-lobby/live-game views — verify a test covering the transition from live to ended for a connected player.
- [x] 6.2 New FR/EN copy (`player/copy.ts`) — verify no hardcoded copy remains inline.

## 7. Verification and traceability

- [x] 7.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (fresh local `supabase db reset` first) — verify all pass. **Result**: all four green — `packages/shared` 22/22, `tools/db` 61/61, `apps/web` 138/138, `apps/party` 71/71 tests; typecheck/lint/build all clean across every workspace.
- [x] 7.2 Confirm (read-only check, no code expected) that `EventEditorPage`'s existing `readOnly = event.status !== 'draft'` already covers `ended` correctly — record the confirmation in this task's completion note. **Confirmed**: `readOnly = event.status !== "draft"` is a plain boolean check treating `"live"` and `"ended"` identically — re-read the file, unchanged since MILESTONE-04, no code needed. Same for the underlying RLS: `event_admin_write_while_draft` (`using/with check (is_admin() and status = 'draft')`, MILESTONE-02) already blocks any admin write once status leaves `draft`, for either `live` or `ended`.
- [x] 7.3 FR traceability table:

  | FR | Requirement (SPEC.md) | Verified by |
  |---|---|---|
  | FR-033 | Flow-controller admin can start/advance/reveal/show-leaderboard/end the event | Already built across MILESTONE-07 (`mc:start`/`mc:advance`)/MILESTONE-08 (`mc:reveal`) plus this milestone's `mc:show_leaderboard`/`mc:end` (tasks 2.1/2.2); "launch a transition screen" has no separate command in SPEC.md's own protocol table — covered by `operator:display` (MILESTONE-09) |
  | FR-046 | Own result revealed only at MC reveal or timer end, whichever first | Already implemented and tested in MILESTONE-08 (`mc:reveal`'s `not_locked` precondition, design.md D3 there) — re-verified via the full existing `apps/party` suite passing unchanged (aside from one error-code precision fix, see task 2.2's note); not re-implemented |
  | FR-065 | MC "stop" command == end the event | `mc:end` handler (task 2.2); `eventroom.test.ts` "mc:end" suite |
  | FR-066 | On end: lock all scores, compute/persist final rankings, permanently read-only | `mc:end`'s persist-then-transition flush of `event_final_participant`/`event_final_team` + `event.status`/`ended_at` (task 2.2); the three permanently-read-only guards (task 3.1/3.2/3.3, design.md D3/D4); `EventEditorPage`'s read-only UI confirmed already covering `ended` (task 7.2) |
  | FR-067 | Final podium view available for individuals and teams | `mc:end` sets `lastRankings` to the final totals, available via the existing reconnect-caching mechanism (design.md D2); `operator:display` remains usable post-end so the screen can still be driven to podium (task 3.4); `LeaderboardView`'s team-rankings extension for the podium view specifically (task 4.1) |

  No FR is unaddressed. Three scoping gaps found and fixed as part of this milestone, not worked around: the permanently-read-only guards `mc:lock`/`mc:reveal`/`answer:submit` never needed before `mc:end` existed (design.md D3/D4); the big screen's leaderboard/podium never rendered team rankings since MILESTONE-09 despite FR-057/FR-067 requiring it (design.md D6, plus a genuinely broken pre-existing test assertion found and fixed while verifying it — see task 4.1's note); the player's "event ended" terminal state, unreachable before this milestone (task 6.1).

## 8. Close-out

- [ ] 8.1 No new Postgres migration this milestone — confirm `apps/party`'s production deploy succeeds on merge, then (after explicit owner confirmation) a real connection test against the deployed Worker/console: reveal at least one step, show the leaderboard, then end the event, confirming `event_final_participant`/`event_final_team` rows land in production Postgres, the event becomes read-only, and the screen can still be driven to the podium view afterward.
