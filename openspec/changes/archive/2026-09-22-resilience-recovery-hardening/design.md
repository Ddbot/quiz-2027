## Context

`EventRoom`'s Durable Object state (`room_state` table) and `local_answer` are both written via `this.sql` — genuinely durable SQLite storage provided by the Durable Object runtime, not in-memory. `loadState()` (constructor) and `persistState()` (called after every state-changing command) already implement the rehydrate path FR-084 asks for. `apps/web/src/routes/player/useEventRoom.ts`'s `PartySocket` connection has no override disabling the `partysocket` library's own default reconnect-with-backoff — FR-086's mechanism already exists. What's missing is entirely at the edges: what the player sees across a full page reload, and what they see while a drop is being silently retried.

MILESTONE-05 already hit and resolved the one real toolchain obstacle this milestone would otherwise run into: `evictDurableObject()` (the official `cloudflare:test` helper for simulating DO eviction) hangs indefinitely on this project's `@cloudflare/vitest-pool-workers` version. That milestone's task 5.4 verified manually instead — `wrangler dev` locally, state claimed over a real WebSocket, the whole `wrangler dev` process tree killed and restarted (Miniflare's local DO SQLite persists to disk across runs, so this is a strictly stronger reset than in-memory eviction), reconnected, state intact. This design reuses that exact approach rather than inventing a new one.

## Goals / Non-Goals

**Goals:**
- Close the one real gap: a reloading player currently loses their place and has to re-identify.
- Give a player some signal during a drop, instead of a silently-retrying dead-looking screen.
- Prove, not assume, that reconnect-after-answering and DO-restart-after-answering both hold.

**Non-Goals:**
- Rebuilding or restructuring `loadState`/`persistState` — already correct.
- A Postgres-backed fallback for the (essentially theoretical, for a SQLite-backed Durable Object) case where the DO's own durable storage is itself lost — FR-084's "and, if needed, Postgres" clause is a defensive allowance for that failure mode, not a mandate to build reconciliation logic for it in this zero-cost PoC; see Risks below.
- Any change to `withRetry`'s defaults — re-verified as reasonable, not touched (design decision D3).
- MILESTONE-15's scripted multi-client harness — a different milestone entirely.

## Decisions

### D1: The reload-rejoin check runs once, after the auth session first resolves; it overrides the render once "found", rather than gating it

`OnboardingFlow` currently initializes `step` to `{ name: "identity" }` unconditionally and renders `IdentityStep` synchronously on the very first render, regardless of auth state. The reload check adds one read — `participant` select scoped to `(event_id, profile_id = auth.uid())`, already covered by the existing `participant_select_self_or_admin` RLS policy, no new grant needed — run exactly once, the first time `useAuth()`'s session stops being `undefined` (see `useExistingParticipant`).

The first implementation gated the component's entire render on this check settling (rendering nothing until it resolved), to avoid ever flashing the identity form before redirecting a reloading player. That gate turned out to be the wrong trade-off in practice: it delays the very first paint behind an extra async hop for *every* mount, including the overwhelmingly common non-reload case where the check will resolve to "not found" and change nothing. The check instead runs as a pure override: the identity flow renders exactly as it always has, and only switches to `JoinedView` once (and if) the check resolves to "found." The accepted cost is a brief flash of the identity form before switching, only for a genuine reload with an already-joined session — strictly better than blocking every mount to avoid a flash that, in the common case, was never going to happen anyway.

This mirrors `join_event`'s own already-idempotent behavior: a player who reloads and technically re-submits through the identity flow would get the *same* participant back anyway — this change just skips the unnecessary re-prompt, it doesn't change what happens if they somehow do go through it again.

### D2: The connection indicator reads `connectionStatus` directly; no new state

`useEventRoom` already exposes `connectionStatus: "connecting" | "open" | "closed"`. `JoinedView` (which is only ever rendered once a player has an active session and participant) shows a small banner whenever it's not `"open"`. No new tracking is needed — `"closed"` already covers both a fresh drop and the window while `partysocket` is retrying, since the status only flips back to `"open"` once a reconnect actually succeeds.

### D3: `withRetry`'s existing defaults are re-confirmed, not changed

`[200, 400, 800]`ms (4 total attempts, ~1.4s total window) was chosen in MILESTONE-08 to fail fast enough not to stall the live flow while still absorbing a brief Postgres blip. Nothing about this milestone's scope (client/player-side resilience, DO rehydrate) gives a concrete reason to change it — re-verified as still reasonable, left untouched.

### D4: The reconnect-after-answering test is new coverage of already-correct behavior, not a behavior change

The existing `"reconnect shows current state, not a replay (FR-063)"` suite only exercises a *new* connection. Nothing in `handleAnswerSubmit`/`onConnect`/`sendState` treats "reconnecting" as a distinct case from "connecting" — a reconnect is just a fresh WebSocket connection that happens to belong to a participant who already has a row in `local_answer`. The expectation is this already works correctly (the `unique (step_id, participant_id)` constraint doesn't care about connection history), and the new test exists to prove that rather than to change anything.

## Risks / Trade-offs

- [Total loss of a Durable Object's own SQLite storage, not just an eviction/restart, would leave `loadState()` returning `defaultRoomState()` even if Postgres already shows the event as live] → Accepted as out of scope (Non-Goals) — Cloudflare's SQLite-backed Durable Object storage is documented as durable specifically so this doesn't happen in normal operation; building automatic Postgres-reconciliation for a failure mode this rare, in a zero-cost PoC, is a disproportionate response MILESTONE-05's own "verify manually, don't over-engineer" precedent already argues against.
- [The reload-rejoin check adds one Postgres round trip before a returning player sees anything] → Acceptable; it replaces a flow that would otherwise show the identity form and then discard it once the player, submitting again, hit the idempotent join path — net faster, not slower, for the common case.

## Migration Plan

No schema change. No new migration. Deploys as a normal frontend/Worker-test change.
