## 1. `packages/shared`: profanity module + protocol/state additions

- [x] 1.1 New `packages/shared/src/profanity.ts`: the literal FR+EN wordlist array and `isProfane(candidate: string): boolean` (case-insensitive substring match, matching Postgres `is_profane()`'s semantics), exported via `index.ts` — verify a unit test covering a profane match (both languages), a clean name, and a case-insensitive match.
- [x] 1.2 `room.ts`: `RoomState.killSwitch: boolean`, defaulting `false` in `defaultRoomState()` — verify `pnpm --filter @quiz/shared typecheck`.
- [x] 1.3 `protocol.ts`: `McKillSwitchCommand extends ClientCommand { type: "mc:kill_switch"; payload: { on: boolean } }`; `StateMessage`/`toStateMessage` gain `killSwitch` — verify `pnpm --filter @quiz/shared typecheck` and the isolation check pass.

## 2. `supabase/migrations`: `moderate_participant`/`moderate_team`

- [x] 2.1 New migration: `public.moderate_participant(p_participant_id uuid, p_hidden boolean default null, p_display_name text default null)` and `public.moderate_team(p_team_id uuid, p_hidden boolean default null, p_name text default null)` — `security definer`, internal `is_admin()` check, no `event.status` restriction, non-null name checked via `is_profane()` before writing, `null` parameters leave that field unchanged; `revoke ... from public, anon` / `grant ... to authenticated` matching the existing `create_team`/`rename_team` pattern — verify `tools/db` tests: happy-path hide, happy-path rename, profane-rename rejection, works while `event.status = 'live'`, non-admin rejected, for both functions.

## 3. `apps/party`: kill switch + hidden-filtering

- [x] 3.1 `handleMcKillSwitch` — any admin (ungated by `requireController`, mirroring `handleClaimControl`/`handleOperatorDisplay`); sets `RoomState.killSwitch` from the payload, persists, broadcasts `state` — verify tests for activating, clearing, a non-admin rejection, and that `display`/`step` are unchanged by either.
- [x] 3.2 `handleAnswerSubmit` rejects with a dedicated error code while `killSwitch` is true — verify a test sending `answer:submit` while the kill switch is active, asserting rejection and no `local_answer` row written.
- [x] 3.3 `fetchRoster` and `computeRankings`'s `team` query both select `hidden`; `computeRankings`'s returned `individuals`/`teams` arrays exclude entries where `hidden = true`, without renumbering the surviving ranks; the scoring input (`scoreStep`'s `participants`) stays built from the unfiltered roster — verify a test with one hidden participant and one hidden team confirming: they're excluded from the returned `RankingsMessage`, their answers/scores are still persisted to `step_result_participant`/`step_result_team`, and a hidden participant's points still count toward their (non-hidden) team's total.
- [x] 3.4 `handleMcReveal`'s `stepResults.participants` assembly likewise excludes hidden participants from the broadcast/cached `StepResultsMessage`, while `answer` rows are still written for everyone — verify a test asserting a hidden participant's row is written to `answer` but absent from the broadcast `step_results` message.

## 4. `apps/web`: client-side profanity wiring

- [x] 4.1 The onboarding join form checks the display name with `isProfane` before submitting, showing the same rejection copy the server would return, without a round trip — verify a test typing a profane name and asserting the rejection appears before any network call, plus the existing server-rejection path still works unchanged.
- [x] 4.2 The team create/rename forms check the team name with `isProfane` before submitting, same pattern — verify tests for both forms mirroring 4.1.

## 5. `apps/web`: admin console moderation UI + kill switch

- [x] 5.1 New roster component on `LiveControlPage.tsx` (or a small extracted component it renders): lists the event's participants and teams (direct PostgREST read against `participant`/`team`), each with hide/show and rename controls calling `moderate_participant`/`moderate_team`, refetching after each action; renders regardless of `eventStatus` — verify tests for listing, hiding, and renaming, and a test confirming the section renders for a `draft` event.
- [x] 5.2 Kill-switch toggle on `LiveControlPage.tsx` sending `mc:kill_switch` (any admin — enabled without requiring flow control) — verify a test asserting the command shape for both activating and clearing.
- [x] 5.3 New French copy for the moderation section and kill-switch toggle (`admin/copy.ts`) — verify no hardcoded copy remains inline.

## 6. `apps/web`: big-screen kill-switch overlay

- [x] 6.1 `ScreenViews.tsx`'s `BigScreenView` renders a full blank overlay whenever `killSwitch` is true, before its existing `display` branching, and resumes the current `display` view once cleared — verify a test toggling `killSwitch` true/false around an arbitrary `display` value, asserting the overlay appears/disappears and the underlying view is unaffected.
- [x] 6.2 New FR/EN copy in `screenCopy.ts` if the overlay needs any visible text (evaluate during implementation — a true blank may need none) — verify no hardcoded copy remains inline if any is added. **Result**: no copy needed — the overlay is a true blank (`KillSwitchOverlay`), matching `BlankView`'s own existing zero-copy precedent for the same `display: "blank"` view.

## 7. `apps/web`: player-facing kill-switch overlay

- [x] 7.1 The player's connected view (`OnboardingFlow.tsx`/`LiveGameView.tsx`) renders the same blank overlay whenever `killSwitch` is true, ahead of its existing status/view branching, and resumes its prior view once cleared — verify a test mirroring 6.1 for the player side.
- [x] 7.2 New FR/EN copy in `player/copy.ts` if needed (NFR-012) — verify no hardcoded copy remains inline if any is added. **Result**: no copy needed — same true-blank rationale as task 6.2.

## 8. Verification and traceability

- [x] 8.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (fresh local `supabase db reset` first) — verify all pass. **Result**: all four green — `packages/shared` 26/26, `tools/db` 71/71, `apps/web` 156/156, `apps/party` 79/79 tests; typecheck/lint/build all clean across every workspace.
- [x] 8.2 FR traceability table:

  | FR | Requirement (SPEC.md) | Verified by |
  |---|---|---|
  | FR-039 | Admin kill switch blanks all screens/players within 2s, clears cleanly | `mc:kill_switch` handler (task 3.1); big-screen/player overlays (tasks 6.1/7.1); `RoomState.killSwitch` independence from `display`/`step` (design.md D3) |
  | FR-069 | Display name and team name validated against FR+EN wordlist at entry, reject with retry | Server-side already built MILESTONE-03/06, re-verified unchanged; new client-side companion (tasks 1.1, 4.1, 4.2) |
  | FR-070 | Admin can hide or rename any participant or team, before or during an event | `moderate_participant`/`moderate_team` RPCs (task 2.1); console UI (task 5.1) |
  | FR-071 | Hidden participants/teams excluded from big-screen views, answers/scores retained in the record | `computeRankings`/`handleMcReveal` filtering (tasks 3.3/3.4); scoring/persistence left unfiltered (design.md D4) |

  No FR is unaddressed.

## 9. Close-out

- [ ] 9.1 No destructive migration this milestone — confirm production deploy succeeds on merge, then (after explicit owner confirmation) a real connection test: trigger and clear the kill switch against a live production event, hide/rename a participant or team and confirm it disappears from the console's expectations and the big screen's rankings while its answers remain queryable in Postgres.
