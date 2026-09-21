## Why

Most of this milestone's resilience story is already built — Durable Object state and answers are already durably persisted, and the client already auto-reconnects. What's missing is the one place a returning player actually falls through the cracks: a full page reload sends them back to the identity form instead of rejoining, and a dropped connection gives them no indication anything is happening while it silently retries. MILESTONE-14 closes those gaps and puts the already-built recovery mechanisms through their paces.

## What Changes

- A full page reload for a player who has already joined an event now skips straight back to their current step, instead of re-showing the identity/consent form.
- A player whose connection drops sees a small, unobtrusive indicator while it reconnects, instead of a screen that looks dead.
- New test coverage for a scenario nothing exercised yet: a player who already answered, disconnects, and reconnects — confirming they see the step's current locked/unlocked state and a repeat submission is still rejected.
- A manual verification (following the exact precedent MILESTONE-05 already established for `evictDurableObject()`'s toolchain hang) that a real Durable Object process restart loses no committed answer.
- Re-confirmation that the existing flush retry/backoff tuning (`withRetry`'s `[200, 400, 800]`ms defaults) is still reasonable.

FR-082/FR-083 (answers written before ack; flush-with-retry) were already built and verified in MILESTONE-08 — out of scope here.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `live-game`: a reloading player rejoins their current step directly; a player sees when their connection isn't currently open; a reconnecting player's answer and the step's lock state both survive correctly.

## Impact

- `apps/web/src/routes/player/OnboardingFlow.tsx`: checks for an existing participant on mount before showing the identity form.
- `apps/web/src/routes/player/useEventRoom.ts` / `JoinedView`: a connection-status indicator during live play.
- `apps/party/test/eventroom.test.ts`: a new reconnect-after-answering test scenario.
- `openspec/changes/resilience-recovery-hardening/tasks.md`'s close-out: a manual DO-restart verification note, following MILESTONE-05's own established precedent.
