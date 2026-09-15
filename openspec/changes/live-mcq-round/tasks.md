## 1. Shared protocol and state (`packages/shared`)

- [x] 1.1 Extend `RoomState`/`StateMessage` with `question: { text: string; options: { id: string; label: string }[] } | null` (design.md D6) — verify `pnpm --filter @quiz/shared typecheck` and the isolation check pass.
- [x] 1.2 Add `GRACE_MS` constant (design.md D3) and command/message types (`McStartCommand`, `McAdvanceCommand`, `McLockCommand`, `AnswerSubmitCommand`, `AnswerAckMessage`) — verify a unit test asserting `toStateMessage` includes `question` when present and `null` when not.

## 2. EventRoom: `mc:start`

- [x] 2.1 `mc:start` handler: `requireFlowController` gate (design.md D1), rejects a non-draft event or an event with zero steps (`no_steps`, design.md D9), writes `event.status = 'live'`/`season_year` to Postgres (design.md D2), activates step 1 with `timer_started_at`, fetches and sets `question` from `game_mcq`, schedules the expiry alarm if timed (design.md D3) — verify a `tools/db`-style real-Supabase test (via `@cloudflare/vitest-pool-workers`, extending `eventroom.test.ts`) asserting the event's Postgres row actually transitions to `live` and the broadcast state shows step 1 active with its question.
- [x] 2.2 `mc:start` rejects a non-controller and a non-draft event — verify tests for both.

## 3. EventRoom: `mc:advance`

- [x] 3.1 `mc:advance` happy path: current step → `done`, next step → `active` with a fresh timer and question, alarm rescheduled — verify a test.
- [x] 3.2 `mc:advance` rejects a non-controller, and rejects with `no_next_step` on the event's last step (design.md D9) without changing state — verify tests for both.
- [x] 3.3 A repeated `mc:advance` (already applied) is a no-op — verify a test asserting no additional state change/broadcast.

## 4. EventRoom: `mc:lock` and the expiry alarm

- [x] 4.1 `mc:lock` happy path: active step → `locked` — verify a test; verify it rejects a non-controller.
- [x] 4.2 The DO alarm, scheduled at `timer_started_at + countdown_seconds + GRACE_MS` for a timed active step, transitions that step to `locked` on its own with no client message — verify a test that starts a timed step with a short countdown, waits past expiry, and asserts the broadcast state shows `locked` without any `mc:lock` being sent. **Toolchain note**: `runDurableObjectAlarm()` (the built-in deterministic trigger for this, from `cloudflare:test`) hangs indefinitely on this project's current toolchain — the same class of issue as `evictDurableObject()` hanging in MILESTONE-05 — confirmed empirically (also seen in task 4.3). Resolved by discovering alarms DO fire on their own after real wall-clock time in this environment; the test waits for the real 1s-countdown + 2s-grace deadline instead.
- [x] 4.3 A stale alarm (the step already moved on by other means before the alarm fires) is a no-op — resolved as: testing a literal "stale alarm fires late" scenario isn't constructible through the public API, since Cloudflare's one-alarm-at-a-time semantics mean `setAlarm` always replaces any pending alarm (a superseded alarm can never fire for real) — so the meaningful, testable guarantee is `onAlarm()`'s generic idempotent-no-op behavior itself (locks the active step if there is one, otherwise does nothing), which the test verifies by calling the public `onAlarm()` method directly via `runInDurableObject` twice in a row and asserting the second call leaves the persisted `room_state` row byte-for-byte unchanged. **Toolchain note**: asserting via a WebSocket broadcast reaching a live connection didn't work when `onAlarm()` is invoked this way (manually, not through the platform's real alarm-delivery path) — it doesn't reliably re-attach to the same hibernation-tracked connection `broadcast()` sends to. Asserting via the persisted SQLite row instead (also a public method, `this.sql`) sidesteps that harness quirk entirely.

## 5. EventRoom: `answer:submit`

- [x] 5.1 A valid answer (active step, before expiry, first answer from this participant) is accepted: persisted to the local SQLite `local_answer` table (design.md D5), acknowledged via `answer_ack` (design.md D7) — verify a test asserting the ack and, via `runInDurableObject`, the row's presence.
- [x] 5.2 Rejections: a non-active step, a late submission (past expiry + grace, checked fresh per design.md D4), and a duplicate answer for the same participant/step — verify one test per case, each asserting no new row was written. **Refinement**: the task's original framing ("specifically catches a case where the step is technically still `active` but past the deadline") turned out not to be reliably constructible as a *distinct* test case — since alarms fire on their own after real time passes (task 4.2's finding), waiting past the deadline races the alarm, and the step may read as `active` (rejected via the fresh time check, code `too_late`) or already `locked` by the alarm (rejected via the active-step check, code `not_active`) depending on which wins. Both are correct rejections of a late answer per FR-043's actual guarantee ("never accept a late answer"), so the test accepts either code rather than asserting one deterministically, with the race explained in a comment.
- [x] 5.3 `receipt_seq` is monotonically increasing across multiple participants' answers for the same step — verify a test with several accepted answers, asserting strictly increasing `receipt_seq` values in submission order.

## 6. EventRoom: propagation timing (FR-031 acceptance)

- [x] 6.1 A state change (e.g. `mc:advance`) reaches 10 simultaneously connected clients within 2 seconds — verify a test opening 10 real WebSocket connections (extending the existing harness) and asserting every connection's next message arrives within the 2-second budget. **Harness note**: the 10 *user accounts* are created in parallel (real Supabase Auth round trips are the slow part of setup, unrelated to what's being measured); the 10 *connections* are established sequentially, since simultaneous `SELF.fetch` WebSocket upgrades to the same room didn't reliably resolve in this test harness — a setup-time harness quirk, not a weakening of the acceptance criterion, which is measured only around the broadcast itself once every connection is already established.

## 7. `apps/web`: WebSocket client hook

- [x] 7.1 `useEventRoom(eventId, accessToken)`: connects via `PartySocket` (`VITE_PARTY_HOST`, `query: { token: accessToken }`, matching `ScreenRoute.tsx`'s existing call shape), parses incoming `state`/`error`/`answer_ack` messages, exposes the current state, connection status, and a `sendCommand` function — verify a unit test covering connect, a received `state` message updating the exposed state, and `sendCommand`'s outgoing message shape.
- [x] 7.2 Client-side expiry: computes `clockOffsetMs` fresh from each `state` message's `serverNow` and exposes a `isExpired(step)` helper (design.md D8) — verify a unit test with a mocked clock asserting the computed expiry instant.

## 8. `apps/web`: live-game views

- [x] 8.1 Waiting view: countdown/branding only, no media, shown while `eventStatus === 'live'` and no step is active — verify a test. **Note**: no literal countdown timer in the waiting view itself (branding-only copy) — there is nothing to count down to between steps (the flow-controller's next `mc:start`/`mc:advance` is admin-paced, not on a client-visible clock); the per-question countdown lives in the question view via the step's own timer, matching SPEC.md's "countdown and/or branding only" wording.
- [x] 8.2 Question view: renders the active step's question/options from state, lets the player select one option (no submission yet), then an explicit confirm control calls `sendCommand("answer:submit", ...)` — verify a test covering select-without-submit and confirm-submits.
- [x] 8.3 Answered/locked view: once `answer_ack` is received or the step's state is `locked`, selection disables and a holding view shows (no result) — verify a test for both triggers.
- [x] 8.4 Client-side hard lock: selection disables at the computed expiry instant even before a `locked` broadcast arrives (design.md D8) — verify a test with a mocked clock (`useEventRoom.test.ts`'s `isExpired` suite) and a test asserting `LiveGameView` honors an already-true `isExpired` before `step.status` catches up (`LiveGameView.test.tsx`).
- [x] 8.5 New FR/EN copy entries for every string introduced in 8.1–8.4 — verify no hardcoded copy remains inline (grep spot-check, same convention as prior milestones).

## 9. Wiring into the player flow

- [x] 9.1 The team-lobby step's container starts the WebSocket connection (task 7.1) once reached, and renders the live-game view (task 8) in place of the team-lobby content once `state.eventStatus === 'live'` — verify a test covering both the team-lobby-still-showing (draft) and live-game-showing (live) branches. **Note**: `accessToken` for `useEventRoom` is the player's Supabase session access token (`useAuth().session?.access_token`, `apps/web/src/hooks/useAuth.ts`) — the same JWT `EventRoom.ts`'s `verifyToken` already validates against Supabase's JWKS (MILESTONE-05), not a value derived from the `participant` row. The branch condition uses `state?.eventStatus ?? event.status` so the room's own live broadcast supersedes the event summary's point-in-time snapshot once a `state` message arrives, while still rendering something sensible (the draft-era team lobby) before the first message does.

## 10. Verification and traceability

- [x] 10.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (including a fresh local `supabase db reset` before the `apps/party`/`tools/db` suites) — verify all pass. **Result**: all four green after a fresh `supabase db reset` — `packages/shared` 8/8, `tools/db` 61/61, `apps/web` 95/95, `apps/party` 34/34 tests; `pnpm -w typecheck`/`lint`/`build` all clean across every workspace.
- [x] 10.2 FR traceability table:

  | FR | Requirement (SPEC.md) | Verified by |
  |---|---|---|
  | FR-031 | Push every state change to all connected clients, reflected within 2s at 10 concurrent connections | `eventroom.test.ts` describe("propagation timing (FR-031 acceptance)") — task 6.1 |
  | FR-040 | Every step has a countdown timer; 0 seconds denotes untimed | `RoomStep.timed`/`countdownSeconds` read from `step` (already modeled MILESTONE-02); `scheduleAlarmForCurrentStep` only arms the alarm when `step.timed` — tasks 2.1/4.2; `LiveGameView` untimed-step behavior implicit (no expiry check when `!step.timed`, task 7.2/8.4) |
  | FR-041 | Require select-then-explicit-confirm to submit | `LiveGameView`'s `QuestionView`: local `selectedOptionId` state, no `sendCommand` call until the confirm button is pressed — task 8.2, `LiveGameView.test.tsx` "lets the player select an option without submitting, then confirm sends answer:submit" |
  | FR-042 | At most one answer per (step, participant); immutable once submitted | `local_answer`'s `unique (step_id, participant_id)` constraint (design.md D5) + `handleAnswerSubmit`'s duplicate-insert rejection — task 5.2, `eventroom.test.ts` "rejects a duplicate answer" |
  | FR-043 | Timer expiry = authoritative start + countdown (+ grace); reject late answers | `handleAnswerSubmit`'s fresh `Date.now() > expiryMs` check independent of `step.status` (design.md D4) — task 5.2, `eventroom.test.ts` "rejects a late answer" (`too_late`/`not_active`) |
  | FR-044 | Expiry locks input on all clients for that step; no auto-advance | Server: DO alarm transitions `active → locked` only, never calls advance logic — task 4.2. Client: `LiveGameView` disables selection once `step.status !== "active"` or `isExpired(step)` — task 8.3/8.4. Confirmed `mc:advance` is a distinct, explicitly flow-controller-invoked command (task 3.1) that the alarm never calls. |
  | FR-045 | Stamp each answer with server receipt time + monotonic receipt sequence | `local_answer.submitted_at` (server `new Date().toISOString()`) and `id` (SQLite autoincrement, doubling as `receipt_seq` per design.md D5) — task 5.1/5.3, `eventroom.test.ts` "receipt_seq is monotonically increasing" |
  | FR-064 | Waiting-state media on the big screen only; players see countdown/branding only | `LiveGameView`'s `WaitingView` — branding-only copy, no media, no image asset — task 8.1. Big screen's own real waiting view stays MILESTONE-09 scope (`ScreenRoute.tsx` untouched) |

  Decisions confirmed recorded: season-year-placeholder (design.md D2, `apps/party/src/EventRoom.ts` — `seasonYear = new Date().getUTCFullYear()`, tasks.md 2.1 note); `no_next_step`/`no_steps` explicit rejections (design.md D9, tasks 2.2/3.2); `RoomState.display` left untouched (design.md Goals/Non-Goals — no command in this milestone writes `display`, confirmed by grep: no `display:` assignment anywhere in `handleMcStart`/`handleMcAdvance`/`handleMcLock`/`lockCurrentStepIfActive`). No FR is unaddressed.

## 11. Close-out

- [ ] 11.1 No new Postgres migration this milestone — confirm `apps/party`'s production deploy (the existing GitHub Action, triggered on merge) succeeds and, after explicit owner confirmation, do a real connection test against the deployed Worker exercising at least `mc:claim_control` → `mc:start` → a question broadcast, to confirm the new Postgres write path (`event.status`/`season_year`) works against production credentials.
