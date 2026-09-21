## 1. `apps/web`: reload rejoins the current step directly

- [x] 1.1 `OnboardingFlow.tsx`: once `useAuth()`'s session first resolves, check (exactly once) for an existing `participant` row for `(event, profile)`; if found, switch to `JoinedView` with that participant (design.md D1, refined during implementation — an override on top of the normal render, not a gate blocking it) — verify tests: a session that already has a participant for this event eventually renders `JoinedView`; a session with no participant for this event (or no session at all) keeps showing the normal identity flow and never redirects; a later session change (e.g. `signInAnonymously()` succeeding mid-flow) does not retrigger the check or interrupt an in-progress join.

## 2. `apps/web`: connection indicator

- [x] 2.1 `JoinedView` (or `LiveGameView`) shows a small, unobtrusive indicator whenever `connectionStatus !== "open"` during live play (design.md D2) — verify tests: the indicator appears when the connection closes and disappears once it reopens; it never appears while the connection is open.
- [x] 2.2 New FR/EN copy (`player/copy.ts`) — verify no hardcoded copy remains inline.

## 3. `apps/party`: reconnect-after-answering test coverage

- [x] 3.1 New test scenario (alongside the existing `"reconnect shows current state, not a replay (FR-063)"` suite): a player submits an answer, disconnects, the step is locked while they're away, they reconnect — verify the fresh `state` message shows the step as `locked`, and a repeated `answer:submit` is still rejected with `already_answered` (design.md D4) — no server-side code change expected; this proves existing behavior, it doesn't add new behavior.

## 4. Verification and traceability

- [x] 4.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (fresh local `supabase db reset` first) — verify all pass. **Result**: all four green — `packages/shared` 26/26, `tools/db` 96/96, `apps/web` 179/179, `apps/party` 83/83 tests; typecheck/lint/build all clean across every workspace (one transient Windows/libuv crash on `apps/web`'s build immediately after it had already reported success — confirmed unrelated by retrying `apps/web build` alone, which succeeded cleanly).
- [x] 4.2 Re-confirm `apps/party/src/retry.ts`'s `withRetry` defaults (`delaysMs: [200, 400, 800]`) remain reasonable (design.md D3) — record the confirmation in this task's completion note; no code change expected. **Confirmed**: re-read `retry.ts` in full — unchanged since MILESTONE-08. 4 total attempts (1 initial + 3 retries), ~1.4s total window before giving up. Still reasonable for this milestone's goals: long enough to absorb a brief Postgres blip, short enough not to stall the live flow behind a flush that's genuinely failing. No code change made.
- [x] 4.3 FR traceability table:

  | FR | Requirement (SPEC.md) | Verified by |
  |---|---|---|
  | FR-084 | DO rehydrates authoritative state from SQLite (and, if needed, Postgres) after eviction/restart | Already built (`loadState`/`persistState`, MILESTONE-05); re-verified via manual `wrangler dev` process-restart test with a committed answer (task 5.1, close-out) |
  | FR-085 | Player reload/reconnect rejoins the current step with correct locked/unlocked state, no duplicate answer | Reload-rejoin fix (task 1.1); reconnect-after-answering test (task 3.1) |
  | FR-086 | Client auto-reconnects with backoff; no offline play, no answer queueing | Already built (`partysocket` default behavior); re-verified (no override found); connection indicator (task 2.1) makes the in-progress reconnect visible rather than silent |

  No FR is unaddressed.

## 5. Close-out

- [x] 5.1 Manual DO-restart verification (design.md, MILESTONE-05 precedent) — no production push needed this milestone (no schema/migration change): run `wrangler dev` locally, connect a real WebSocket client, start an event and submit a real answer, kill and restart the entire `wrangler dev` process tree, reconnect to the same room, and confirm the submitted answer and current step state are both intact. Record the result in this task's completion note, the same way MILESTONE-05's task 5.4 did. **Result**: ran `wrangler dev --port 8787` locally against a fresh `supabase db reset`; created a real event/step/admin/player via throwaway scripts reusing `tools/db`'s own `createAdmin`/`createPlayer`/`createAdminClient` helpers (deleted afterward, never committed). Admin claimed control and started the event; player submitted a real `answer:submit` and received its ack. Killed the entire `wrangler dev` process tree via `taskkill /F /T` (confirmed both `workerd.exe` instances terminated — a genuine OS-level process restart, not in-memory eviction), started a fresh `wrangler dev` instance, and reconnected. Both the admin's and player's fresh `state` snapshots showed `eventStatus: "live"`, the same `controllerId`, and the exact same step (`id`/`timerStartedAt` unchanged) — `room_state` fully survived. A repeat `answer:submit` for the same step was rejected with `already_answered` — the committed answer itself (not just `controllerId`, extending MILESTONE-05's own check) survived the restart via the Durable Object's durable SQLite storage.
