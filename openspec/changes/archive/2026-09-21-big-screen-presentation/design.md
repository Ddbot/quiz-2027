## Context

See proposal.md for motivation/scope. Relevant existing state:

- `apps/party/src/EventRoom.ts`: `ConnState.role` is currently `"player" | "admin"` only; `resolveRole` returns `admin` for any `profile.is_admin` connection, `player` otherwise. `RoomState.display` (`RoomDisplay` union already includes all 7 required views since MILESTONE-05) has never been written by any command — every milestone's design.md has deliberately left it inert pending "Operator-driven choice that doesn't exist yet." `step_results`/`rankings` (MILESTONE-08) are one-shot broadcasts on `mc:reveal`, not part of the persisted `RoomState`.
- `apps/web/src/routes/ScreenRoute.tsx` is still the MILESTONE-01 scaffold placeholder (a dev-only ping widget). `apps/web/src/routes/player/useEventRoom.ts` (MILESTONE-07/08) is a generic-enough WebSocket hook already parsing `state`/`step_results`/`rankings`/`own_result`/`error`/`answer_ack` — built for the player, reusable here.
- `event.waiting_media_path` (a public Storage URL) and `event.waiting_countdown_target` (nullable timestamptz) exist since MILESTONE-04 but are deliberately excluded from `event_public_summary` (the player-facing read) — only a direct, RLS-gated `event` table read (requires `is_admin()`) can see them.
- No admin UI exists anywhere to invoke `mc:start`/`mc:advance`/`mc:lock`/`mc:reveal` — production verification for MILESTONE-07/08 was done by hand-typing WebSocket commands into a browser console.

## Goals / Non-Goals

**Goals**: a human can run a live event end-to-end from a real UI (MC console); a venue screen shows a real, high-contrast, Operator-directed view (FR-058..063); a reconnecting screen never shows stale/replayed content.

**Non-Goals**: `mc:show_leaderboard`'s and `mc:end`'s own command handlers (MILESTONE-10) — this milestone's console only gets buttons for commands that already exist; real event-end finalisation (`event_final_*`, permanent read-only) — the podium view renders current `rankings` data, not a "final" result; `mc:kill_switch` (MILESTONE-11); a `roster`/live-answer-count broadcast for the collecting view (SPEC.md's `roster` message was never built in any prior milestone and isn't required by FR-058..063 — the collecting view is a "question is live, holding" view, not a live count).

## Decisions

### D1: The screen role reuses the operator's own admin session, not a new token-issuance system

SPEC.md's "screen when the connection presents the screen query flag and a valid admin-issued screen token" has no issuance mechanism defined anywhere in the data model or REST API sections. Chrome/Edge's built-in Presentation API implementation, for the realistic zero-cost-PoC scenario (casting to a second monitor on the operator's own machine — "1-UA" mode, not external Chromecast hardware per NFR-013's zero-cost constraint), opens the target URL in a new window within the *same browser instance* — same origin, same `localStorage`, same Supabase session. The screen page therefore needs no separate credential: it reads the operator's own already-signed-in session via the existing `useAuth()`/`AuthProvider`, and connects with that JWT plus a `?screen=1` query flag. `EventRoom.ts`'s `resolveRole` assigns `role: "screen"` instead of `"admin"` when an admin-identified connection presents that flag; a non-admin presenting it is simply ignored (still resolves `player`/rejected as before — the flag only ever *narrows* an admin connection, it never grants elevated access).

**Alternative considered**: a real token-issuance RPC (new table, expiry/revocation). Rejected for this milestone — it's real additional scope (schema change, new endpoint) to support a scenario (an unauthenticated kiosk/Chromecast device) this zero-cost PoC doesn't actually target; SPEC.md's own casting requirement (FR-059) is scoped to "a Chrome/Edge desktop browser," i.e. the operator's own machine.

### D2: `RoomState` gains `lastStepResults`/`lastRankings`, cleared and kept on different schedules

`lastStepResults: StepResultsMessage | null` is set whenever `mc:reveal` broadcasts, and cleared (`null`) whenever `mc:start`/`mc:advance` activates a new step — so it always represents "the current step's results, if any," never a stale prior step's. `lastRankings: RankingsMessage | null` is set on every `mc:reveal` and never cleared — a cumulative total is never stale, only superseded by the next reveal. Both are resent (alongside the `state` snapshot) to any connection on connect/reconnect, satisfying FR-063 for the screen role and, as a side effect, closing the same gap MILESTONE-08's design.md flagged-and-deferred for players (not re-litigated here, just no longer true).

Both fields fold into the *same* `applyMutation` call as the step's `status → revealed` transition in `handleMcReveal` — one state mutation, one persist, one `state` broadcast, then the existing `step_results`/`rankings`/`own_result` sends, unchanged in shape or order from MILESTONE-08.

### D3: `operator:display` is gated to `role === "admin"` only, not the flow-control lock

Per the Actor table, "Operator mode" is explicitly independent of who holds MC flow control ("No flow control while another admin holds the lock" describes *MC* mode only). `operator:display` therefore uses the same ungated-admin check as `mc:claim_control` (`state.role === "admin"`), not `requireController`.

### D4: FR-061 (no player-entered content off-directive) is enforced client-side, not by filtering the broadcast

`step_results`/`rankings` already reach every connection identically (screens, players, admins) — MILESTONE-08 built no per-role filtering, and adding one now would diverge screens from every other role for no protocol benefit. FR-061's guarantee is instead a rendering discipline: `ScreenRoute`'s view components only ever render `participantId`-adjacent display names or team names inside the results/leaderboard views; every other view (waiting/question/collecting/podium/blank) never touches that data even though it may already be sitting in the hook's state. Recorded as a decision because it's a real security-adjacent property (FR-061, NFR-008's PII posture) resting on client discipline rather than server enforcement — acceptable here because the *screen* connection is always the operator's own already-privileged admin session (D1), not an untrusted client the server needs to defend against.

### D5: The caster uses the Presentation API when available, a plain new window otherwise

Feature-detected via `"PresentationRequest" in window` (Chrome/Edge desktop per NFR-015). When available, `new PresentationRequest(screenUrl).start()` (a user-gesture-gated call) opens the native "cast to a display" picker. When unavailable — most dev/test environments have no `PresentationAvailability`, and NFR-015 doesn't promise the API on every browser — the same button falls back to `window.open(screenUrl, "_blank")`, letting the operator manually drag the window to a second monitor. Either path opens the same origin, so D1's session-sharing holds either way. Multiple simultaneous screens (mirrored) work automatically: every connection with `role: "screen"` receives the same broadcasts, so N open screen windows always show identical content with no extra code.

### D6: The MC console is bundled into this milestone (owner-confirmed)

SPEC.md's milestone list never dedicates a milestone to the admin's "MC mode" (flow control UI) despite the Actor table describing it as a real capability — MILESTONE-05/07/08 each added protocol commands with no corresponding UI. Confirmed with the owner to bundle a minimal MC console into this milestone rather than leave the gap open further: buttons for `mc:claim_control`/`mc:start`/`mc:advance`/`mc:lock`/`mc:reveal` (everything that exists today), reachable from `EventEditorPage`. Later milestones (`mc:show_leaderboard`/`mc:end` in MILESTONE-10, `mc:kill_switch` in MILESTONE-11) add their own buttons to this same page when they add those commands — not retrofitted speculatively now.

### D7: The screen reads waiting-screen media via a direct `event` table read, not `event_public_summary`

`event_public_summary` (the player-facing view) deliberately excludes `waiting_media_path`/`waiting_countdown_target` (MILESTONE-03 design). Since the screen connection is always an admin session (D1), it reads the real `event` table directly (`is_admin()` RLS already permits this) — no new view or RPC needed.

### D8: The podium view is explicitly framed as "current standings," not a finalisation claim

`mc:end`/`event_final_*` (real finalisation, permanent read-only, official podium) is MILESTONE-10's job. This milestone's podium view renders the same `rankings` data the leaderboard view does (top entries), so the Operator has *something* to show if they select "podium" before MILESTONE-10 exists — it is not labeled as final and carries no different data path than the leaderboard.

## Risks / Trade-offs

- [Risk] FR-061's enforcement being client-side (D4) means a screen page a *non-operator* somehow reached could see PII-adjacent data regardless of the selected view → Mitigation: accepted — the screen connection requires an admin session (D1); this is exactly as trusted as the admin console itself already is, not a new trust boundary.
- [Risk] The Presentation API's real cross-device behavior can't be exercised in most CI/dev environments (no secondary display) → Mitigation: the fallback path (`window.open`) is what's actually testable and is the real mechanism for this PoC's realistic use case (D5); the feature-detected `PresentationRequest` call itself is covered by a unit test asserting it's invoked when the global exists, not by an end-to-end cast.

## Migration Plan

1. `packages/shared`: `RoomRole` gains `"screen"`; `RoomState` gains `lastStepResults`/`lastRankings`; `protocol.ts` gains `OperatorDisplayCommand`.
2. `apps/party`: `EventRoom.ts` — screen role resolution, `operator:display` handler, `lastStepResults`/`lastRankings` caching + resend-on-connect, clearing on `mc:start`/`mc:advance`.
3. `apps/party/test/eventroom.test.ts`: extend with screen-role connection tests, `operator:display` tests, reconnect-shows-current-not-replay tests.
4. `apps/web`: `useEventRoom` gains an optional screen flag; `ScreenRoute.tsx` replaced with the real receiver + 7 view components; new `apps/web/src/routes/admin/LiveControlPage.tsx` (MC console + caster + `operator:display` buttons), linked from `EventEditorPage`.
5. No new Postgres migration.
6. Rollback: additive to `apps/party`/`apps/web`/`packages/shared` only — a plain `git revert`; no data migration.

## Open Questions

None — the screen-auth mechanism (D1) and the MC-console bundling (D6) were both resolved with the owner before writing this document; FR-061's enforcement point (D4) and the podium view's framing (D8) are resolved above rather than left open.
