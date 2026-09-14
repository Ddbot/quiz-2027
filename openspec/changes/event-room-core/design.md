## Context

See proposal.md - Why/What Changes for motivation and scope. Relevant existing state:

- `apps/party/src/EventRoom.ts` (MILESTONE-01) extends `partyserver`'s `Server` base class and only overrides `onMessage` to echo. `partyserver@0.5.10`'s `Server` exposes the hooks this milestone needs directly: `onConnect(connection, ctx)` (`ctx.request` is the original WS-upgrade `Request`, so the `?token=` query param is readable there), `connection.setState()`/`.state` (typed, hibernation-persisted per-connection state — the natural place to stash `{role, profileId}` once resolved), `connection.close()` (inherited from `WebSocket`, used to reject an invalid connection), `this.sql` (a tagged-template wrapper already provided by `Server` over the Durable Object's own SQLite storage — no need to reach for `ctx.storage.sql` directly), and `this.broadcast()`.
- `apps/party/src/index.ts` already routes every request to the right `EventRoom` instance via `routePartykitRequest`, pinned to the `eu` jurisdiction (MILESTONE-01, Q-001 resolved) — unchanged by this milestone.
- `apps/party/src/env.d.ts` already declares `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWKS_URL` as worker secrets (scaffolded in MILESTONE-01, unused until now). Supabase's default JWKS endpoint for a project using the current asymmetric signing-key format (confirmed by this project's `sb_publishable_…`/`sb_secret_…` key style — see `tools/db/.env.example`) is `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
- `wrangler.jsonc` already provisions `new_sqlite_classes: ["EventRoom"]` (MILESTONE-01) — the Durable Object already has its own SQLite storage available; this milestone is the first to use it.
- `data-model` (MILESTONE-02, archived) already defines `profile` (`id`, `is_anonymous`, `is_admin`) and `participant` (`event_id`, `profile_id`) — exactly what role resolution needs to query, via a service-role client bypassing RLS (the same "DO writes via service-role key" pattern SPEC.md §7.5 already documents, here used for a read).
- `@cloudflare/vitest-pool-workers` (already a dev dependency, used by `apps/party/test/eventroom.test.ts`) exports `evictDurableObject(stub, options?)` from `cloudflare:test` — a first-class way to simulate eviction in tests, so "does state survive eviction" is directly testable rather than a research spike.
- No `apps/party` dependency yet exists for either JWT verification or a Supabase client.

## Goals / Non-Goals

**Goals**: a real connection lifecycle (verify → assign role → snapshot → stay in sync), one real command (`mc:claim_control`) proving the flow-control lock and idempotent-mutation mechanism end to end, and state that survives a Durable Object eviction.

**Non-Goals**: any other WebSocket command (`mc:start/advance/lock/reveal/...`, `answer:submit`, `operator:display`, `mc:kill_switch` — later milestones); the `screen` role; the FR-031 load-tested propagation acceptance (needs real game-flow mutations to be meaningful — MILESTONE-07); writing anything to Postgres from the DO (this milestone only reads `profile`/`participant` for role resolution; the first DO→Postgres *write* is MILESTONE-08's scoring flush).

## Decisions

### D1: JWT verification via `jose`'s remote JWKS with per-instance caching

`jose` (`createRemoteJWKSet` + `jwtVerify`) is Web-Crypto-based and has zero Node-specific dependencies, so it runs natively in the Workers runtime without `nodejs_compat` help. `createRemoteJWKSet(url)` returns a `JWKSet` function that `jose` itself caches (by key id) across calls, so constructing it once per Durable Object instance (stored on `this`, built lazily on first connect) avoids re-fetching the JWKS on every connection while staying correct if Supabase ever rotates keys (a cache-miss triggers exactly one re-fetch).

**Alternative considered**: hand-rolled verification via Web Crypto directly. Rejected — `jose` is a well-audited, dependency-free library purpose-built for this, and hand-rolling JWT/JWKS verification is exactly the kind of security-sensitive code not worth re-implementing.

### D2: Role resolution reuses `@supabase/supabase-js` with the service-role key, added to `apps/party`

Verifying the JWT proves *who* the caller is (the `sub` claim = `profile.id`); resolving `is_admin` and the `participant` row is a Postgres read that must bypass RLS (SPEC.md §7.5: "the DO derives role... server-side and trusts no client-asserted privilege"). `@supabase/supabase-js` is already the project's standard Postgres client (used identically in `apps/web` and `tools/db`); adding it to `apps/party` with the service-role key (already a provisioned Worker secret) is consistent rather than introducing a second client library or raw `fetch`-to-PostgREST calls.

**Alternative considered**: raw `fetch` calls to PostgREST. Rejected — `supabase-js` is fetch-based under the hood (Workers-compatible, no Node APIs required) and using it keeps one client library project-wide instead of two.

### D3: Connection rejection happens in `onConnect`, after the WebSocket upgrade completes

`partyserver`'s hibernatable-WebSocket model accepts the WS upgrade before application code runs; `onConnect(connection, ctx)` is where verification happens, closing the connection (`connection.close(4001, "unauthorized")`) if the token is missing or fails verification, or if a non-admin caller has no `participant` row for this event. This is the only place `ctx.request` (carrying the original `?token=` query string) is available. No `state` message is ever sent to a connection that fails verification — from the client's observable perspective, the socket simply closes immediately, which matches the requirement ("rejected before any event state is shared").

### D4: Authoritative state lives in one small SQLite row, read on construction and written on every mutation

State is small and single-valued per event (not a growing log), so it is stored as one JSON-serialized row in a dedicated table (`create table if not exists room_state (id integer primary key check (id = 0), data text not null)`), read via `this.sql` in an async `loadState()` called from the constructor (via `blockConcurrencyWhile`, so no connection is handled before state is loaded) and written via the same tagged-template `this.sql` on every accepted mutation, using `insert ... on conflict (id) do update` to keep it a single row.

**Alternative considered**: `ctx.storage.get`/`put` (the Durable Object's native KV-style storage, distinct from its SQLite storage) instead of SQL. Rejected only because `this.sql` is already the tool `partyserver` hands you for exactly this DO's storage, and a table gives a natural place to grow into (later milestones adding step results, answers, etc., per SPEC.md's "written to SQLite before ack" invariant) rather than a single opaque KV blob.

### D5: `controllerId` is a `profile_id`; the flow-control guard and the idempotent-mutation helper are pure functions in `packages/shared`

State's `controllerId: string | null` holds a `profile_id`, not a connection id — this is what makes FR-037 (resume control across reconnect) fall out for free: on reconnect, role resolution again produces the same `profile_id`, and `requireFlowController(state, callerProfileId)` (a pure, portable function: `state.controllerId === callerProfileId`) still says yes. `applyMutation(state, mutate)` is the idempotency primitive: `mutate` is a pure function `(state) => state`, returning the *same object reference* when nothing actually changes; `EventRoom` only persists and broadcasts when `mutate(state) !== state`. Both live in `packages/shared` (NFR-017's portable-module boundary) with no Cloudflare/DO import, unit-tested directly with plain Vitest (no `@cloudflare/vitest-pool-workers` needed for their own tests) — the pattern later milestones' real command handlers (`mc:start`, scoring, etc.) will reuse.

**Alternative considered**: an idempotency-key/request-id dedup table (track "have I seen this exact command before"). Rejected for this milestone — SPEC.md's idempotency requirement (FR-035) is about transitions not double-advancing state, not about deduplicating literal retried requests; the reference-equality/no-op approach satisfies that directly and more simply. A request-id dedup mechanism can be layered in later if a specific command actually needs it (e.g. `answer:submit`'s own `receipt_seq`, which is a Postgres-level concern already handled by `data-model`'s unique constraint, not this DO).

### D6: `mc:claim_control` is the one command this milestone wires end to end

Rather than build generic command-dispatch infrastructure for commands that don't exist yet, `onMessage` parses a minimal JSON envelope (`{ type: string, payload?: unknown }`) and handles exactly one case, `mc:claim_control`: reject unless `connection.state.role === "admin"`, then `applyMutation(state, (s) => s.controllerId === connection.state.profileId ? s : {...s, controllerId: connection.state.profileId})`. Every other message `type` gets a generic `error` response (`{code: "unknown_command", message}`) rather than being silently ignored — later milestones add cases to this same `switch`, not a new dispatch mechanism.

## Risks / Trade-offs

- [Risk] `jose`'s remote-JWKS caching is per-instance (per Durable Object), so a cold-started DO always pays one JWKS fetch on its first connection → Mitigation: acceptable at this project's scale (10 concurrent connections, one live event at a time); a cold-start JWKS fetch adds tens of milliseconds, not seconds, and is far cheaper than verifying against a stale/incorrect key.
- [Risk] Storing state as one JSON blob in SQLite (D4) loses the ability to query individual fields with SQL until a later milestone needs to (e.g. answers as real rows) → Mitigation: acceptable now — this milestone's state is small and always read/written as a whole; later milestones (MILESTONE-07+) add their own dedicated tables (e.g. `answer`) rather than growing this one.
- [Risk] Role resolution adds a Postgres round-trip to every new WebSocket connection → Mitigation: acceptable at this project's scale; if it ever matters, the resolved `{profileId, isAdmin}` could be cached briefly, but that is speculative optimization this milestone does not need.

## Migration Plan

1. `packages/shared`: add state types, `applyMutation`, `requireFlowController` — pure TS, no new dependency, portable per NFR-017.
2. `apps/party`: add `jose` and `@supabase/supabase-js` dependencies; rewrite `EventRoom.ts` (`onConnect` for auth+role+snapshot, `onMessage` for `mc:claim_control`, `onClose` no-op for now, SQLite load/persist).
3. `apps/party/.dev.vars.example` / README secrets matrix: no new variables (all three secrets were already scaffolded in MILESTONE-01) — just a note that they are now load-bearing, and the local value for `SUPABASE_JWKS_URL` (`{local SUPABASE_URL}/auth/v1/.well-known/jwks.json`).
4. `apps/party/test/eventroom.test.ts`: rewrite the echo-roundtrip test for the new contract (auth accept/reject, snapshot, `mc:claim_control`, reconnect-preserves-control, eviction-survives-state) using the existing harness plus `evictDurableObject` from `cloudflare:test`.
5. Deploy through the existing pipeline (GitHub Action → `wrangler deploy` on merge to `main`) — this milestone touches no Postgres migration and needs no production database change; the only production step is confirming the three worker secrets are actually set (they were declared in MILESTONE-01 but this milestone is the first to depend on their being *correct*, not just present).
6. Rollback: purely additive to `apps/party`/`packages/shared` source; a revert is a plain `git revert` with no data migration (no new Postgres schema, and the DO's own SQLite state is disposable/regenerable from an admin re-authoring the event if ever needed).

## Open Questions

None — the two decisions that could have been ambiguous (screen-role scope, eviction-testing mechanism) are resolved above (D-notes in proposal.md's scope note, and D-context's `evictDurableObject` finding) rather than left open.
