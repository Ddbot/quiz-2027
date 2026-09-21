## 1. `supabase/migrations`: wire up `joined_at_position`/`current_step_id`/`timer_started_at`, add `event_dashboard`

- [x] 1.1 New migration: `create or replace function public.join_event(...)` (same signature) — on the INSERT branch only, reads `event.current_step_id`, resolves it to `step.position` (or `0` when `current_step_id is null`), and stamps the new `participant.joined_at_position` with it — verify `tools/db` tests: a participant created while the event is `draft` gets `joined_at_position = 0`; a participant created with `current_step_id` pointing at a step of position N gets `joined_at_position = N`; a repeat join returns the existing row with its original `joined_at_position` unchanged (not recomputed).
- [x] 1.2 Same migration: `event_dashboard(p_event_id uuid)` — `security definer`, explicit `is_admin()` check, returns `{ participant_count, completion_rate, per_question: [{step_id, correct, incorrect}], avg_response_ms, final_participants: [...], final_teams: [...] }` per design.md D3/D4/D5/D6 — verify `tools/db` tests: happy path against a hand-crafted fixture (participant counts, completion rate matching a hand calculation including a late joiner per design.md D1's `joined_at_position` semantics, per-question correct/incorrect counts, a plausible `avg_response_ms`, final rankings matching `event_final_participant`/`event_final_team`); a non-admin rejection; a zero-revealed-steps event returns `completion_rate: 0` not an error; no field of the response ever contains an email address (assert the raw JSON string contains none of the fixture's known email addresses).

## 2. `apps/party`: keep `event.current_step_id`/`step.timer_started_at` synchronized

- [x] 2.1 `handleMcStart` additionally writes `current_step_id` (and the first step's `timer_started_at`) to Postgres in its existing `event` update — verify a test asserting `event.current_step_id`/`step.timer_started_at` in Postgres after `mc:start`.
- [x] 2.2 `handleMcAdvance` writes `current_step_id` to `event` (a new Postgres write — it previously made none) and the next step's `timer_started_at` to `step` — verify a test asserting both are updated in Postgres after `mc:advance`, distinct from the prior step's values.

## 3. `apps/web`: analytics dashboard page

- [x] 3.1 `useEventDashboard(eventId)` hook calling the `event_dashboard` RPC — verify a test asserting the RPC call shape and that loading/error/loaded states are handled.
- [x] 3.2 `DashboardPage.tsx`: participant count, completion rate (as a percentage), a per-question table (ordered by step position, correct/incorrect counts), average response time (formatted), final individual + team rankings tables — verify a test rendering a fixture response and asserting each figure appears.
- [x] 3.3 New route `/admin/events/:eventId/dashboard` in `AdminRoute.tsx`, linked from `EventEditorPage.tsx` (mirroring the existing `liveControlLink` pattern), available regardless of `eventStatus` — verify a test asserting the link's `href` and that the route renders the page.
- [x] 3.4 New French copy (`admin/copy.ts`) — verify no hardcoded copy remains inline.

## 4. Verification and traceability

- [x] 4.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (fresh local `supabase db reset` first) — verify all pass. **Result**: all four green — `packages/shared` 26/26, `tools/db` 79/79, `apps/web` 161/161, `apps/party` 81/81 tests; typecheck/lint/build all clean across every workspace.
- [x] 4.2 FR traceability table:

  | FR | Requirement (SPEC.md) | Verified by |
  |---|---|---|
  | FR-072 | Admin-only dashboard: participant count, completion rate, per-question correct/incorrect, average response time, final rankings | `event_dashboard` RPC (task 1.2); `DashboardPage.tsx` (task 3.2) |
  | FR-073 | Completion rate = answers submitted / steps present for (from join step onward), aggregated | `join_event`'s `joined_at_position` stamping (task 1.1); `event_dashboard`'s ratio-of-sums computation (task 1.2, design.md D3) |
  | FR-074 | No player email anywhere in the dashboard | `event_dashboard` never selects/joins `profile` (task 1.2); explicit no-email test (task 1.2) |

  No FR is unaddressed.

## 5. Close-out

- [ ] 5.1 One new (non-destructive) migration this milestone — confirm production deploy succeeds on merge, then (after explicit owner confirmation) `supabase db push` to production followed by a real connection test: start/advance a disposable production event, confirm `event.current_step_id`/`step.timer_started_at` land in Postgres, then load its dashboard and confirm the figures look right (including after a deliberately-late second join, if practical).
