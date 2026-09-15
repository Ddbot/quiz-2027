## 1. Migration: team RPCs and dissolution trigger

- [ ] 1.1 `create_team(p_event_id uuid, p_name text)`: validates caller has a `participant` row for the event, event is draft, name isn't profane; inserts the team with the caller as captain, sets the caller's `team_id`; catches the unique-index violation and re-raises `name_taken`; `revoke`/`grant` matching `join_event`'s pattern (design.md D1) — verify `supabase db reset` applies cleanly.
- [ ] 1.2 `join_team(p_team_id uuid)`: validates the team exists and isn't dissolved, caller has a `participant` row for that team's event, event is draft; sets the caller's `team_id` (switching directly if already on a team) — verify `supabase db reset` applies cleanly.
- [ ] 1.3 `leave_team(p_event_id uuid)`: validates caller has a `participant` row for the event, event is draft; sets the caller's `team_id` to null (design.md D2 — explicit event id param) — verify `supabase db reset` applies cleanly.
- [ ] 1.4 `rename_team(p_team_id uuid, p_name text)`: validates caller is the team's captain, event is draft, name isn't profane; updates the name; catches the unique-index violation and re-raises `name_taken` — verify `supabase db reset` applies cleanly.
- [ ] 1.5 Dissolution trigger: `AFTER UPDATE ON event` firing when `status` transitions to `live`, snapshotting undersized (< 2 member) non-dissolved teams before mutating (design.md D3), nulling their members' `team_id` and marking them `dissolved` — verify `supabase db reset` applies cleanly.

## 2. `tools/db` tests: team RPCs

- [ ] 2.1 `create_team` happy path: an authenticated participant creates a team and becomes captain, `team_id` set — verify a test asserting the returned team shape and the participant's updated `team_id`.
- [ ] 2.2 `create_team` rejects: a non-participant (no `participant` row for the event), a profane name, a duplicate (case-insensitive) name, and a non-draft event — verify one test per case asserting the specific error keyword (`not_a_participant` / `profanity` / `name_taken` / `event_not_joinable`) and that no team is created.
- [ ] 2.3 `join_team` happy path and switching: joining an open team succeeds with no cap; a participant already on a team who joins a different team ends up on only the new one — verify tests for both.
- [ ] 2.4 `join_team` rejects: a dissolved team, a team in a different event than the caller's participant, and a non-draft event — verify one test per case.
- [ ] 2.5 `leave_team` happy path: an on-team participant leaves and is set to solo (`team_id` null) — verify a test; also verify it rejects for a non-draft event.
- [ ] 2.6 `rename_team` happy path and rejections: the captain renames successfully; a non-captain member is rejected (`not_captain`); a profane or duplicate name is rejected; a non-draft event is rejected — verify one test per case.
- [ ] 2.7 Direct writes denied: a non-admin identity attempting to `UPDATE participant.team_id`, `UPDATE team.name`, or `UPDATE team.captain_participant_id` directly (bypassing the RPCs) is denied — verify a test per column, extending the existing RLS suite pattern (`tools/db/test/rls.test.ts` or a new file).

## 3. `tools/db` tests: dissolution trigger

- [ ] 3.1 A single-member team is dissolved and its member set to solo when the event transitions to `live` — verify a test using the admin/service-role client to flip `event.status` (matching `rls.test.ts`'s existing "content locked once live" pattern), asserting the team's `dissolved` flag and the member's `team_id`.
- [ ] 3.2 A two-or-more-member team survives the same transition unchanged — verify a test in the same fixture.
- [ ] 3.3 After the event is `live`, all four RPCs reject — verify a test calling each of `create_team`/`join_team`/`leave_team`/`rename_team` against the now-live event and asserting `event_not_joinable`.

## 4. `apps/web`: team-lobby data layer

- [ ] 4.1 Types for `Team`/`TeamsListItem` and a `useTeamLobby(eventId, participantId)` hook: fetches the event's non-dissolved teams (with member counts) and the caller's own participant row (for current `team_id`), exposing `createTeam`/`joinTeam`/`leaveTeam`/`renameTeam` actions that call the RPCs and refetch afterward (design.md D6) — verify a unit test covering fetch, each action's RPC call shape, and refetch-after-mutation.
- [ ] 4.2 Error mapping: RPC error keywords (`name_taken`, `profanity`, `not_a_participant`, `not_captain`, `event_not_joinable`) map to a typed error kind the UI can render a specific message for — verify a unit test covering the mapping, including an unrecognized error falling back to a generic kind.

## 5. `apps/web`: team-lobby UI

- [ ] 5.1 Team-lobby step component: shown only when the resolved event's `status` is `draft`; renders the create-team form, the joinable-teams list with a join button each, and (if on a team) the current team with a leave button — verify a test for each of: solo view showing create+list, on-team view showing current team + leave, and the step being skipped entirely for a non-draft event.
- [ ] 5.2 Create-team form: submits a name, shows the `name_taken`/profanity retry message on rejection (mirroring the existing onboarding `ProfanityRetry` pattern) — verify a test for the happy path and both rejection messages.
- [ ] 5.3 Join/switch: selecting a different team from the list moves the player directly (no separate leave step in the UI) — verify a test asserting the `join_team` call and the updated current-team display.
- [ ] 5.4 Leave: a leave control returns the player to the solo view — verify a test.
- [ ] 5.5 Rename (captain only): a rename control appears only for the captain, submits a new name, shows the same retry messages on rejection — verify a test for the control's captain-only visibility and the happy/rejection paths.

## 6. Wiring into the onboarding flow

- [ ] 6.1 `OnboardingFlow` inserts the team-lobby step after a successful `join_event`, passing the resolved event and the newly-created/returned participant — verify `apps/web/src/routes/player/OnboardingFlow.test.tsx` covers reaching the new step after joining a draft event, and the existing terminal "joined" screen still renders as-is for a live/ended event (no team-lobby step shown).
- [ ] 6.2 New FR/EN copy entries added to `apps/web/src/routes/player/copy.ts` for every string introduced in tasks 5.x — verify no hardcoded copy remains inline (spot-check via grep of the new component files, same convention as prior milestones).

## 7. Verification and traceability

- [ ] 7.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (including a fresh local `supabase db reset` before the `tools/db` suite) — verify all pass.
- [ ] 7.2 FR traceability table in this task's completion note, mapping FR-012 through FR-019 to the specific task(s)/test(s) that verify each; confirm no FR is unaddressed and the FR-018/FR-051-is-a-typo-for-FR-069 finding and the captain-succession assumption are both recorded.

## 8. Close-out

- [ ] 8.1 Push the migration to production (`supabase db push`) after explicit owner confirmation — verify the new functions and trigger exist in the production project before merging.
