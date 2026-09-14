## 1. Portable state module (`packages/shared`)

- [x] 1.1 Add `RoomState` type (`eventStatus`, `step` summary or `null`, `display` directive, `controllerId`) and `RoomRole = "player" | "admin"` — verify `pnpm --filter @quiz/shared typecheck` passes and the isolation check (`scripts/check-shared-isolation.mjs`) still passes with no new disallowed imports.
- [x] 1.2 Add `applyMutation(state, mutate)` — returns `{ state, changed }`, `changed` true only when `mutate(state) !== state` (design.md D5) — verify a unit test covering a no-op mutation (returns same reference, `changed: false`) and an actual change (`changed: true`).
- [x] 1.3 Add `requireFlowController(state, callerProfileId)` — pure boolean check (design.md D5) — verify a unit test covering the controller/non-controller/no-controller-yet cases.

## 2. Dependencies

- [x] 2.1 Add `jose` and `@supabase/supabase-js` to `apps/party`; verify `pnpm install` and `pnpm --filter party typecheck` succeed.

## 3. Connection authentication

- [x] 3.1 `onConnect` reads `?token=` from `ctx.request`, verifies it against `SUPABASE_JWKS_URL` via `jose` (design.md D1), and closes the connection (no `state` message sent) when the token is missing, malformed, or fails verification — verify a test connecting with no token and with a token signed by a different key both result in the connection closing without any message received.
- [x] 3.2 A connection with a valid token proceeds to role assignment — verify a test connecting with a validly-signed token does not close and reaches the next step.

## 4. Role assignment

- [x] 4.1 Resolve `profile_id`/`is_anonymous`/`is_admin` from the verified JWT's `sub` via a service-role Supabase query (design.md D2), and the caller's `participant` row for this event when not an admin — verify a test asserting the resolved role/profileId for an admin identity and for a joined-player identity.
- [x] 4.2 A non-admin identity with no `participant` row for this event is rejected (connection closed) — verify a test for this case.
- [x] 4.3 The resolved `{role, profileId}` is attached to the connection via `connection.setState(...)` — verify a test asserting subsequent messages from that connection can read its role/profileId back. Verified via the `mc:claim_control` round trip (only reachable correctly if `connection.state.role`/`profileId` survived from `onConnect`) rather than a dedicated introspection test, since `connection.state` has no public read API outside message handlers.

## 5. Authoritative state, persistence, and snapshot

- [x] 5.1 `room_state` SQLite table + `loadState()`/`persistState()` via `this.sql` (design.md D4) — implemented synchronously in the constructor (no `blockConcurrencyWhile` needed: Durable Object SQLite is synchronous, so state is fully loaded before the constructor returns, which already satisfies "before any connection is handled" — a stronger guarantee than the originally-envisioned async pattern). Verified via every connect's snapshot reflecting a sensible default (`eventStatus: "draft"`, `step: null`, `controllerId: null`) for a freshly named room.
- [x] 5.2 On a successful connection (post role-assignment), send a full state snapshot with a server clock reference (`serverNow`) — verified by a test asserting the first message received after connecting is a `state` message matching held state plus a `serverNow` timestamp close to "now".
- [x] 5.3 A reconnecting client's snapshot reflects current state, not stale state from an earlier connection — verified by a test: admin1 mutates state, a *different* admin2 connects fresh and sees the mutation (proves the snapshot mechanism itself is live, distinct from task 7.3's same-identity-reconnect proof).
- [x] 5.4 State surviving Durable Object eviction — **resolved via manual verification, not an automated test.** `evictDurableObject()` (`cloudflare:test`) hangs indefinitely on this project's current toolchain (`@cloudflare/vitest-pool-workers` 0.22.0, the latest published version, pinning an alpha miniflare build) — reproduced with a minimal repro (zero WebSocket connections, still hangs), confirming a toolchain limitation rather than an EventRoom bug. User confirmed (AskUserQuestion): drop the automated test, verify manually instead. Manual verification: ran `wrangler dev` locally, connected via a real WebSocket client with a genuine Supabase-signed JWT, sent `mc:claim_control`, killed the entire `wrangler dev` process tree (a full OS-process restart — a strictly stronger reset than in-memory DO eviction, since Miniflare's local Durable Object SQLite persists to disk across `wrangler dev` runs), started a fresh `wrangler dev` process, reconnected to the same room, and the snapshot's `controllerId` still matched the admin who claimed control before the restart. This is recorded as a code comment in `test/eventroom.test.ts` where the automated test would otherwise be.

## 6. Broadcast on change

- [x] 6.1 Every accepted state mutation broadcasts the updated `state` message to all currently connected clients — verified by a test with two connected admins where only one sends `mc:claim_control`, asserting both receive the updated state.

## 7. Flow-control lock and `mc:claim_control`

- [x] 7.1 `onMessage` parses `{type, payload}` and handles `mc:claim_control`: admin-only, sets `controllerId` to the caller's `profileId` via `applyMutation` — verified by a test asserting a non-admin's `mc:claim_control` is rejected (`error` message, code `forbidden`) and an admin's succeeds.
- [x] 7.2 Reclaiming control you already hold is a no-op (idempotent — design.md D5): no additional broadcast beyond the first claim — verified by a test sending `mc:claim_control` twice from the same admin and asserting the second produces no message within a bounded wait (vs. the first, which does).
- [x] 7.3 An admin who holds control, disconnects, and reconnects is still recognized as the controller (FR-037) — verified by a test: admin claims control, disconnects, reconnects, and the reconnect snapshot already shows them as controller with no re-claim needed.
- [x] 7.4 An unrecognized message `type` gets a generic `error` response rather than being silently ignored — verified by a test sending an unknown command type and asserting an `error` message with code `unknown_command`.

## 8. Update platform-foundation's superseded requirement

- [x] 8.1 Confirm the `platform-foundation` delta spec accurately describes the new connect-and-authenticate contract replacing the MILESTONE-01 echo baseline — re-read against the implemented behavior: "authenticates each connection... SHALL NOT accept a connection whose token fails JWT verification" matches `onConnect`'s reject-on-invalid-token behavior (tasks 3.1/4.2); "accepted and assigned a role... no longer merely echoes" matches role assignment (task 4); "same event identifier shares one object" is unchanged and covered by the new `routing` test. Accurate as written, no edit needed.

## 9. Verification and traceability

- [x] 9.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` — verify all pass, including `apps/party`'s `@cloudflare/vitest-pool-workers` suite. Passed locally on the first pass, but CI (PR #17) caught two real gaps this milestone was first to expose, both fixed: (1) `@quiz/shared`'s gitignored `dist/` didn't exist before CI's Typecheck step, since apps/party is the first package to actually import it — added a "Build shared package" step before Typecheck in `.github/workflows/ci.yml`; (2) `apps/party`'s test suite needs real Supabase credentials via `.dev.vars`, which CI never generated (only tools/db's shell-env equivalent existed) — added generation of `apps/party/.dev.vars` from the same local Supabase credentials. Both verified locally by reproducing the CI conditions before pushing, and confirmed green on PR #17 after.
- [x] 9.2 FR traceability table in this task's completion note, mapping FR-030, FR-032, FR-034..FR-037, and NFR-017 to the specific task(s)/test(s) that verify each; confirm no FR is unaddressed and the screen-role/FR-031/FR-033 deferrals are recorded.

  | FR/NFR | Requirement | Task(s) | Test(s) |
  |---|---|---|---|
  | FR-030 | Authoritative live event state held in the DO | 1.1, 5.1 | `packages/shared/src/room.test.ts` (state shape via `defaultRoomState`), `eventroom.test.ts` "state snapshot on connect" |
  | FR-032 | Full state snapshot + server clock on connect/reconnect | 5.2, 5.3 | `eventroom.test.ts` "state snapshot on connect" (both tests) |
  | FR-034 | Flow-control commands accepted only from the current controller | 1.3, 7.1 | `packages/shared/src/room.test.ts` (`requireFlowController` unit tests — the guard itself, since no other flow-control command exists yet to exercise it end-to-end, per design.md), `eventroom.test.ts` "mc:claim_control" (non-admin rejection, a related but distinct admin-only check) |
  | FR-035 | Idempotent transitions | 1.2, 7.2 | `packages/shared/src/room.test.ts` (`applyMutation` unit tests), `eventroom.test.ts` "is idempotent — reclaiming control..." |
  | FR-036 | Any admin may claim flow control (`mc:claim_control`) | 7.1 | `eventroom.test.ts` "mc:claim_control" (admin succeeds, non-admin rejected) |
  | FR-037 | Resume flow control across reconnect without state loss | 5.3 (general live-state proof), 7.3 (identity-specific) | `eventroom.test.ts` "preserves control across a disconnect and reconnect under the same identity" |
  | NFR-017 | Portable, framework-agnostic game-logic modules | 1.1–1.3 | `packages/shared/src/room.ts`/`room.test.ts` — zero Cloudflare/DO imports, verified by `scripts/check-shared-isolation.mjs` (task 1.1) and plain-Vitest unit tests needing no Workers runtime |

  **Deferred/out of scope this milestone** (recorded per proposal.md and design.md, not silently dropped):
  - `screen` role (SPEC.md §7.4.2) — deferred to MILESTONE-09 (Big screen & Presentation API), which owns issuing screen tokens.
  - FR-031's load-tested "2s propagation at 10 concurrent connections" acceptance — the broadcast *mechanism* is built and tested (task 6.1), but the load-test acceptance itself is deferred to MILESTONE-07, the first milestone with real game-flow mutations to load-test against.
  - FR-033's full flow-controller command set (`mc:start/advance/lock/reveal/show_leaderboard/end`) — deferred to MILESTONE-07/08/10; this milestone ships only `mc:claim_control` and the reusable guard those commands will use.

## 10. Close-out

- [x] 10.1 Update `README.md`'s secrets matrix note (or add one) clarifying that `SUPABASE_JWKS_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are now load-bearing for the worker (previously scaffolded but unused since MILESTONE-01), and document the local JWKS URL convention (`{local SUPABASE_URL}/auth/v1/.well-known/jwks.json`) in `apps/party/.dev.vars.example`'s comments — verify the doc change reads correctly and a local `wrangler dev` run (manual) can complete a JWT-verified connection against the local Supabase stack. Done — README secrets matrix and `.dev.vars.example` updated; the manual `wrangler dev` connection was already exercised (and worked) as part of task 5.4's manual eviction verification.
- [ ] 10.2 Confirm the three production worker secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`) are actually set correctly in the deployed Worker's secrets. `wrangler secret list` confirms presence (all four secrets exist). User confirmed (AskUserQuestion): merge first (triggers the automatic `wrangler deploy` on merge to `main` — no separate production push needed this milestone, no Postgres migration), then do a real WebSocket connection test against the deployed production Worker to confirm correctness. **Remaining: the post-merge connection test.**
