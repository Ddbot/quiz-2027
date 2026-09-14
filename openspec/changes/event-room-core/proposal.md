## Why

The `EventRoom` Durable Object built in MILESTONE-01 is a bare echo server: no authentication, no state, no notion of who is connected or why. Every later live-event milestone (team lobby, MCQ rounds, scoring, big screen, reveal) needs a real, authoritative state object to build on — one that knows who is connected (via the same Supabase JWT that already authorises Postgres access), holds the event's live state, pushes it to every connection, persists it so a Durable Object eviction doesn't lose event state mid-show, and has a flow-control lock so exactly one admin device drives the event at a time. SPEC.md §8 "MILESTONE-05: EventRoom Durable Object core" is next in the milestone sequence and depends only on the already-archived MILESTONE-01 and MILESTONE-02.

## What Changes

- Replace the MILESTONE-01 echo baseline with real JWT verification on WebSocket connect: the Supabase JWT passed as `?token=` is verified against the Supabase JWKS endpoint (`SUPABASE_JWKS_URL`, already scaffolded as an unused worker secret since MILESTONE-01) using the `jose` library — no such dependency exists yet in `apps/party`.
- Add role assignment on connect: resolve `profile_id`/`is_anonymous`/`is_admin` from the verified JWT and the caller's `participant` row for this event (via a service-role Supabase query — the same service-role-key-as-Worker-secret pattern already documented for DO→Postgres access), assigning `role ∈ {player, admin}`. **Scope note**: the `screen` role (SPEC.md §7.4.2: a screen query flag plus an admin-issued screen token) is out of scope here — no mechanism to issue screen tokens exists yet; that arrives with MILESTONE-09 (Big screen & Presentation API), which owns the Operator/Presentation-API flow that issues them.
- Add an authoritative state object held in the Durable Object (`eventStatus`, current step summary, display directive, flow-controller identity), sent as a full snapshot with a server clock reference to every connection on connect/reconnect, and re-broadcast to all connections on every change.
- Add the flow-control lock: `controllerId` is a stable `profile_id`, not a transient connection id, so an MC's disconnect/reconnect under the same identity does not strip control. Any admin connection may send `mc:claim_control` to take over the lock — the only client→server command this milestone implements. A reusable `requireFlowController` guard (rejects a command from anyone but the current controller) is built now as the mechanism every later flow-control command (`mc:start/advance/lock/reveal/...`, arriving in MILESTONE-07/09/10/11) will call.
- Add idempotent transition scaffolding: a small state-mutation helper that only persists/broadcasts when a mutation actually changes state — demonstrated by `mc:claim_control` itself (reclaiming control you already hold is a no-op).
- Add SQLite persistence of state (the Durable Object's own SQLite storage, already provisioned via `new_sqlite_classes` since MILESTONE-01) with rehydration on construction, so an evicted-and-recreated Durable Object instance recovers the event's live state rather than resetting it.
- Establish the portable game-logic module boundary (NFR-017): state types, the flow-controller guard, and the idempotent-mutation helper live in `packages/shared` (already platform-independent, enforced since MILESTONE-01), imported by `apps/party`'s `EventRoom` — the pattern later milestones' real scoring/timer/MCQ modules will follow.

**Out of scope** (later milestones per SPEC.md §8): every other WebSocket command — `mc:start/advance/lock/reveal/show_leaderboard/end` (MILESTONE-07/08/10), `answer:submit` (MILESTONE-07), `operator:display` and the `screen` role (MILESTONE-09), `mc:kill_switch` (MILESTONE-11); team lobby (MILESTONE-06); the load-tested 2-second/10-connection propagation acceptance for FR-031 and the full flow-controller command set for FR-033 (MILESTONE-07/10 respectively — this milestone's broadcast and lock mechanisms are what those build on, but neither FR is fully exercised until real game-flow commands exist to test with).

## Capabilities

### New Capabilities
- `event-room`: the EventRoom Durable Object's connection lifecycle — JWT/JWKS verification, role assignment, authoritative state, snapshot-on-connect, broadcast-on-change, the flow-control lock and `mc:claim_control`, idempotent transitions, and SQLite persistence/rehydration.

### Modified Capabilities
- `platform-foundation`: the "One real-time object per event with a connect-and-echo contract" requirement is superseded — the object now authenticates connections and holds real state instead of echoing. The one-object-per-event routing behavior (SPEC.md's "same event identifier shares one object") is unchanged and carries forward.

## Impact

- `apps/party`: `EventRoom.ts` rewritten (auth, state, lock, persistence); new `jose` dependency; `env.d.ts`'s `SUPABASE_JWKS_URL`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` secrets become load-bearing for the first time (previously scaffolded but unused).
- `packages/shared`: new state types, the flow-controller guard, and the idempotent-mutation helper (platform-independent, no Cloudflare API — verified by the existing `scripts/check-shared-isolation.mjs` isolation check).
- `apps/party/test/eventroom.test.ts`: the existing echo-roundtrip test is replaced/extended for the new connect-auth-state-broadcast contract, using the same `@cloudflare/vitest-pool-workers` harness (`runInDurableObject`, `getServerByName`, `SELF.fetch`).
- No change to `apps/web`, Postgres RLS policies, or the join-code/onboarding flow — players and admins still authenticate via the same Supabase JWT already issued by MILESTONE-03's onboarding flow.
