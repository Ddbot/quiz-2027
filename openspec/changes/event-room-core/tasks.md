## 1. Portable state module (`packages/shared`)

- [ ] 1.1 Add `RoomState` type (`eventStatus`, `step` summary or `null`, `display` directive, `controllerId`) and `RoomRole = "player" | "admin"` — verify `pnpm --filter @quiz/shared typecheck` passes and the isolation check (`scripts/check-shared-isolation.mjs`) still passes with no new disallowed imports.
- [ ] 1.2 Add `applyMutation(state, mutate)` — returns `{ state, changed }`, `changed` true only when `mutate(state) !== state` (design.md D5) — verify a unit test covering a no-op mutation (returns same reference, `changed: false`) and an actual change (`changed: true`).
- [ ] 1.3 Add `requireFlowController(state, callerProfileId)` — pure boolean check (design.md D5) — verify a unit test covering the controller/non-controller/no-controller-yet cases.

## 2. Dependencies

- [ ] 2.1 Add `jose` and `@supabase/supabase-js` to `apps/party`; verify `pnpm install` and `pnpm --filter party typecheck` succeed.

## 3. Connection authentication

- [ ] 3.1 `onConnect` reads `?token=` from `ctx.request`, verifies it against `SUPABASE_JWKS_URL` via `jose` (design.md D1), and closes the connection (no `state` message sent) when the token is missing, malformed, or fails verification — verify a test connecting with no token and with a token signed by a different key both result in the connection closing without any message received.
- [ ] 3.2 A connection with a valid token proceeds to role assignment — verify a test connecting with a validly-signed token does not close and reaches the next step.

## 4. Role assignment

- [ ] 4.1 Resolve `profile_id`/`is_anonymous`/`is_admin` from the verified JWT's `sub` via a service-role Supabase query (design.md D2), and the caller's `participant` row for this event when not an admin — verify a test asserting the resolved role/profileId for an admin identity and for a joined-player identity.
- [ ] 4.2 A non-admin identity with no `participant` row for this event is rejected (connection closed) — verify a test for this case.
- [ ] 4.3 The resolved `{role, profileId}` is attached to the connection via `connection.setState(...)` — verify a test asserting subsequent messages from that connection can read its role/profileId back.

## 5. Authoritative state, persistence, and snapshot

- [ ] 5.1 `room_state` SQLite table + `loadState()`/`persistState()` via `this.sql` (design.md D4), `loadState()` called from the constructor via `blockConcurrencyWhile` before any connection is handled — verify a test asserting a freshly constructed instance (no prior state) starts with a sensible default state (`eventStatus: "draft"`-equivalent placeholder, `step: null`, `controllerId: null`).
- [ ] 5.2 On a successful connection (post role-assignment), send a full state snapshot with a server clock reference (`serverNow`) — verify a test asserting the first message received after connecting is a `state` message matching the held state plus a `serverNow` timestamp.
- [ ] 5.3 A reconnecting client's snapshot reflects current state, not stale state from an earlier connection — verify a test: connect, mutate state (via `mc:claim_control`), disconnect, reconnect, assert the new snapshot includes the mutation.
- [ ] 5.4 State surviving Durable Object eviction — verify a test using `evictDurableObject` (from `cloudflare:test`, design.md context) between a state mutation and a fresh connection, asserting the post-eviction snapshot matches the pre-eviction state.

## 6. Broadcast on change

- [ ] 6.1 Every accepted state mutation broadcasts the updated `state` message to all currently connected clients — verify a test with two connected clients where only one sends a mutating command, asserting both receive the updated state.

## 7. Flow-control lock and `mc:claim_control`

- [ ] 7.1 `onMessage` parses `{type, payload}` and handles `mc:claim_control`: admin-only, sets `controllerId` to the caller's `profileId` via `applyMutation` — verify a test asserting a non-admin's `mc:claim_control` is rejected (`error` message, no state change) and an admin's succeeds.
- [ ] 7.2 Reclaiming control you already hold is a no-op (idempotent — design.md D5): no additional broadcast beyond the first claim — verify a test sending `mc:claim_control` twice from the same admin and asserting only one broadcast (or state-change event) occurs.
- [ ] 7.3 An admin who holds control, disconnects, and reconnects is still recognized as the controller (FR-037) — verify a test: admin claims control, disconnects, reconnects (new connection, same underlying identity), asserts `requireFlowController` still passes for that identity without re-claiming.
- [ ] 7.4 An unrecognized message `type` gets a generic `error` response rather than being silently ignored — verify a test sending an unknown command type and asserting an `error` message is returned.

## 8. Update platform-foundation's superseded requirement

- [ ] 8.1 Confirm the `platform-foundation` delta spec accurately describes the new connect-and-authenticate contract replacing the MILESTONE-01 echo baseline — no code task, verify by re-reading `specs/platform-foundation/spec.md` in this change against the implemented behavior once tasks 3–7 are done.

## 9. Verification and traceability

- [ ] 9.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` — verify all pass, including `apps/party`'s `@cloudflare/vitest-pool-workers` suite.
- [ ] 9.2 FR traceability table in this task's completion note, mapping FR-030, FR-032, FR-034..FR-037, and NFR-017 to the specific task(s)/test(s) that verify each; confirm no FR is unaddressed and the screen-role/FR-031/FR-033 deferrals are recorded.

## 10. Close-out

- [ ] 10.1 Update `README.md`'s secrets matrix note (or add one) clarifying that `SUPABASE_JWKS_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are now load-bearing for the worker (previously scaffolded but unused since MILESTONE-01), and document the local JWKS URL convention (`{local SUPABASE_URL}/auth/v1/.well-known/jwks.json`) in `apps/party/.dev.vars.example`'s comments — verify the doc change reads correctly and a local `wrangler dev` run (manual) can complete a JWT-verified connection against the local Supabase stack.
- [ ] 10.2 Confirm the three production worker secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`) are actually set correctly in the deployed Worker's secrets — after explicit owner confirmation, verify with a manual connection test against the production Worker URL (or `wrangler secret list`, which confirms presence though not correctness) before merging.
