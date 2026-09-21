## 1. Data model

- [x] 1.1 New migration dropping `event_one_live_idx` (`drop index if exists public.event_one_live_idx;`) — verify by applying a fresh `supabase db reset` and confirming two events can both be set to `status = 'live'` via a direct SQL check (`update event set status='live' where id=...` on two different rows, both succeed). **Done**: `supabase/migrations/20260921160000_concurrent_live_events.sql`; verified via `supabase db query --local` inserting two events with `status='live'` in one statement — both returned successfully, no constraint violation. Test rows cleaned up afterward.

## 2. `tools/db`: RLS suite

- [x] 2.1 Flip `tools/db/test/rls.test.ts`'s `"At most one event is live at a time"` describe block (rename it to describe the new behavior) so it asserts `eventA` **can** be set to `live` while `eventLive` already is, and both end up `live` simultaneously — verify `pnpm --filter db test` passes with the new assertion. **Done**: renamed to `"Multiple events may be live concurrently"`, asserts both `eventA` and `eventLive` read back as `live`. Confirmed no later test in the file reads `eventA`'s status or `teamA` after this point (checked every reference), so leaving `eventA` live for the rest of the run is safe. `pnpm --filter db test`: 96/96 passing.
- [x] 2.2 Update the `afterAll` cleanup comment (currently frames deleting `eventLive` as releasing "the one live event slot") to describe it as ordinary fixture hygiene, not global-lock release — no logic change.

## 3. `apps/party`: test comment

- [x] 3.1 Update `test/eventroom.test.ts`'s `afterEach` cleanup comment (currently explains releasing "the one live event slot... otherwise a later test's own mc:start collides") to describe the cleanup as ordinary fixture hygiene — the cleanup logic itself is unchanged (still correct practice). Verify `pnpm --filter party test` still passes unchanged (83/83). **Done**: comment updated, logic untouched. `pnpm --filter party test`: 83/83 passing.

## 4. `tools/harness`: prove two events live concurrently

- [x] 4.1 Add a minimal second-event builder (2-3 participants, 1 untimed step — small and separate from the existing 10-participant `buildFixture()`, which stays untouched) to `tools/harness/src/fixture.ts` or a new sibling module. **Done**: `buildSecondEvent()` in `fixture.ts` — 2 anonymous participants, 1 untimed step, reuses the existing `createStep` helper.
- [x] 4.2 In `tools/harness/src/run.ts` (or a new orchestration step alongside the existing scenario), start the second event's flow while the first event is still live, query Postgres to confirm both event rows show `status = 'live'` simultaneously, then run the second event to completion independently — verify by running `pnpm --filter harness start` locally and confirming the new concurrent-liveness check passes alongside the existing scoring assertions, printed clearly in the harness's console output. **Done**: new `runSecondEventScenario()` in `scenario.ts` (additive, existing `runScenario` untouched); `run.ts` runs both via `Promise.all`, polling a `checkBothLive()` closure (one Postgres query for both event ids) after the second event's own `mc:start`. Ran locally twice: both times printed `[harness] confirmed: both events were observed status='live' in Postgres simultaneously.` and `PASSED`. Noted a benign `wrangler`-logged "Network connection lost" line mid-run both times (routine socket-close noise from ~13 concurrent connections closing near-simultaneously across two events) — does not affect the outcome.

## 5. Spec documents

- [x] 5.1 Update `SPEC.md`: FR-027's text (no longer "at most one event... at any time"), the data-model section's "Partial unique index: at most one row with `status = 'live'`" line (remove), and the Event glossary entry ("At most one `live` at a time in this iteration" — remove that clause). Leave `REQUIREMENTS.md` untouched (owner's own original document). **Done**: all three updated; also lightly reworded FR-028's trailing clause (no longer "can be enabled later" now that they are). Re-grepped for any other "at most one"/"one live event" reference — the only remaining matches are FR-008/FR-042 (unrelated per-participant/per-answer constraints). `REQUIREMENTS.md` not touched.

## 6. Verification and traceability

- [x] 6.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (fresh local `supabase db reset` first; run test suites sequentially per package per this project's established workaround for the known `pnpm -w test` parallel-workspace flakiness) — verify all pass. **Done**: fresh reset, then `pnpm -w typecheck`/`lint`/`build` all clean. Sequential per-package tests: `packages/shared` 26/26, `tools/db` 96/96, `apps/web` 179/179, `apps/party` 83/83 — unchanged from before this change. `pnpm check:shared-isolation` clean.
- [x] 6.2 `tools/harness` run locally against the fresh reset, confirming both the existing scoring scenario and the new concurrent-events proof pass together. **Done**: ran 3 times total across this session (twice while building task 4, once more against this final fresh reset) — all 3 `PASSED`, all 3 confirmed the concurrent-liveness observation.
- [x] 6.3 FR traceability:

  | FR | Requirement (SPEC.md) | Verified by |
  |---|---|---|
  | FR-027 (relaxed) | Multiple events may be live concurrently, no cap | Migration (task 1.1); `tools/db` RLS suite (task 2.1); `tools/harness` concurrent-liveness proof (task 4.2) |

  FR-028 (event-scoped schema) required no change — already satisfied; this change is what it anticipated.

## 7. Close-out (production-touching — confirm with the owner before each step)

- [ ] 7.1 `supabase db push` to production (drops `event_one_live_idx` there) — ask for explicit confirmation before running, per this project's established process for any production-touching step.
- [ ] 7.2 After the production push, confirm with the owner: this is safe to verify passively (no event has been live twice at once in production yet, so there's nothing to observe breaking) — no owner-run verification step is needed beyond the push itself succeeding.
