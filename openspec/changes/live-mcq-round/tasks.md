## 1. Shared protocol and state (`packages/shared`)

- [ ] 1.1 Extend `RoomState`/`StateMessage` with `question: { text: string; options: { id: string; label: string }[] } | null` (design.md D6) — verify `pnpm --filter @quiz/shared typecheck` and the isolation check pass.
- [ ] 1.2 Add `GRACE_MS` constant (design.md D3) and command/message types (`McStartCommand`, `McAdvanceCommand`, `McLockCommand`, `AnswerSubmitCommand`, `AnswerAckMessage`) — verify a unit test asserting `toStateMessage` includes `question` when present and `null` when not.

## 2. EventRoom: `mc:start`

- [ ] 2.1 `mc:start` handler: `requireFlowController` gate (design.md D1), rejects a non-draft event or an event with zero steps (`no_steps`, design.md D9), writes `event.status = 'live'`/`season_year` to Postgres (design.md D2), activates step 1 with `timer_started_at`, fetches and sets `question` from `game_mcq`, schedules the expiry alarm if timed (design.md D3) — verify a `tools/db`-style real-Supabase test (via `@cloudflare/vitest-pool-workers`, extending `eventroom.test.ts`) asserting the event's Postgres row actually transitions to `live` and the broadcast state shows step 1 active with its question.
- [ ] 2.2 `mc:start` rejects a non-controller and a non-draft event — verify tests for both.

## 3. EventRoom: `mc:advance`

- [ ] 3.1 `mc:advance` happy path: current step → `done`, next step → `active` with a fresh timer and question, alarm rescheduled — verify a test.
- [ ] 3.2 `mc:advance` rejects a non-controller, and rejects with `no_next_step` on the event's last step (design.md D9) without changing state — verify tests for both.
- [ ] 3.3 A repeated `mc:advance` (already applied) is a no-op — verify a test asserting no additional state change/broadcast.

## 4. EventRoom: `mc:lock` and the expiry alarm

- [ ] 4.1 `mc:lock` happy path: active step → `locked` — verify a test; verify it rejects a non-controller.
- [ ] 4.2 The DO alarm, scheduled at `timer_started_at + countdown_seconds + GRACE_MS` for a timed active step, transitions that step to `locked` on its own with no client message — verify a test that starts a timed step with a short countdown, waits past expiry, and asserts the broadcast state shows `locked` without any `mc:lock` being sent.
- [ ] 4.3 A stale alarm (the step already moved on by other means before the alarm fires) is a no-op — verify a test: start a short timed step, `mc:advance` before its alarm fires, then confirm the original alarm firing later does not affect the new active step's state.

## 5. EventRoom: `answer:submit`

- [ ] 5.1 A valid answer (active step, before expiry, first answer from this participant) is accepted: persisted to the local SQLite `local_answer` table (design.md D5), acknowledged via `answer_ack` (design.md D7) — verify a test asserting the ack and, via `runInDurableObject`, the row's presence.
- [ ] 5.2 Rejections: a non-active step, a late submission (past expiry + grace, checked fresh per design.md D4 — verify this specifically catches a case where the step is technically still `active` but past the deadline, not just a `locked` step), and a duplicate answer for the same participant/step — verify one test per case, each asserting no new row was written.
- [ ] 5.3 `receipt_seq` is monotonically increasing across multiple participants' answers for the same step — verify a test with several accepted answers, asserting strictly increasing `receipt_seq` values in submission order.

## 6. EventRoom: propagation timing (FR-031 acceptance)

- [ ] 6.1 A state change (e.g. `mc:advance`) reaches 10 simultaneously connected clients within 2 seconds — verify a test opening 10 real WebSocket connections (extending the existing harness) and asserting every connection's next message arrives within the 2-second budget.

## 7. `apps/web`: WebSocket client hook

- [ ] 7.1 `useEventRoom(eventId, accessToken)`: connects via `PartySocket` (`VITE_PARTY_HOST`, `query: { token: accessToken }`, matching `ScreenRoute.tsx`'s existing call shape), parses incoming `state`/`error`/`answer_ack` messages, exposes the current state, connection status, and a `sendCommand` function — verify a unit test covering connect, a received `state` message updating the exposed state, and `sendCommand`'s outgoing message shape.
- [ ] 7.2 Client-side expiry: computes `clockOffsetMs` fresh from each `state` message's `serverNow` and exposes a `isExpired(step)` helper (design.md D8) — verify a unit test with a mocked clock asserting the computed expiry instant.

## 8. `apps/web`: live-game views

- [ ] 8.1 Waiting view: countdown/branding only, no media, shown while `eventStatus === 'live'` and no step is active — verify a test.
- [ ] 8.2 Question view: renders the active step's question/options from state, lets the player select one option (no submission yet), then an explicit confirm control calls `sendCommand("answer:submit", ...)` — verify a test covering select-without-submit and confirm-submits.
- [ ] 8.3 Answered/locked view: once `answer_ack` is received or the step's state is `locked`, selection disables and a holding view shows (no result) — verify a test for both triggers.
- [ ] 8.4 Client-side hard lock: selection disables at the computed expiry instant even before a `locked` broadcast arrives (design.md D8) — verify a test with a mocked clock.
- [ ] 8.5 New FR/EN copy entries for every string introduced in 8.1–8.4 — verify no hardcoded copy remains inline (grep spot-check, same convention as prior milestones).

## 9. Wiring into the player flow

- [ ] 9.1 The team-lobby step's container starts the WebSocket connection (task 7.1) once reached, and renders the live-game view (task 8) in place of the team-lobby content once `state.eventStatus === 'live'` — verify a test covering both the team-lobby-still-showing (draft) and live-game-showing (live) branches.

## 10. Verification and traceability

- [ ] 10.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (including a fresh local `supabase db reset` before the `apps/party`/`tools/db` suites) — verify all pass.
- [ ] 10.2 FR traceability table in this task's completion note, mapping FR-031, FR-040..FR-045, and FR-064 to the specific task(s)/test(s) that verify each; confirm no FR is unaddressed and the season-year-placeholder, no-next-step, and display-left-untouched decisions are recorded.

## 11. Close-out

- [ ] 11.1 No new Postgres migration this milestone — confirm `apps/party`'s production deploy (the existing GitHub Action, triggered on merge) succeeds and, after explicit owner confirmation, do a real connection test against the deployed Worker exercising at least `mc:claim_control` → `mc:start` → a question broadcast, to confirm the new Postgres write path (`event.status`/`season_year`) works against production credentials.
