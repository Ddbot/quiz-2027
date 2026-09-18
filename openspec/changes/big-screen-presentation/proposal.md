## Why

The game has been fully playable via raw WebSocket console commands since MILESTONE-07, but there is no actual UI for a human to run one: no admin screen exists to start/advance/lock/reveal a live event, and the venue-facing `/screen/:eventId` receiver is still MILESTONE-01's dev-only placeholder. Both gaps block a real test event.

## What Changes

- **MC console** (new admin page): buttons for `mc:claim_control`, `mc:start`, `mc:advance`, `mc:lock`, `mc:reveal` — the flow-control commands that exist so far. SPEC.md's Actor table describes this as the admin's "MC mode," but no milestone ever built it; this closes that gap now rather than leaving it open indefinitely. Later flow-control commands (`mc:show_leaderboard`, `mc:end`, `mc:kill_switch`) get their own buttons on this same page in the milestones that introduce them.
- **`/screen/:eventId` receiver**: connects to the EventRoom as `role = screen`, renders only the view the Operator has selected, high-contrast and visually distinct from the player view (FR-060). A new `screen` connection role, resolved server-side — reuses the operator's own already-authenticated admin session rather than inventing a separate token-issuance system (see design.md D1 for why: SPEC.md's "admin-issued screen token" has no defined issuance mechanism anywhere, and the realistic zero-cost-PoC casting scenario — a second monitor on the operator's own machine — shares browser storage with the controlling tab).
- **`operator:display`** command (any admin): sets `RoomState.display` among `waiting | question | collecting | results | leaderboard | podium | blank` (FR-062) — the field every milestone since MILESTONE-07 has deliberately left inert.
- **Seven big-screen views**, each high-contrast/large-format (FR-060): waiting (the event's uploaded media + optional countdown, FR-064's big-screen-only half), question (text + options, never the answer key), collecting (question-active holding view), results (per-participant/team outcome from `step_results` — names now allowed, see FR-061 below), leaderboard (cumulative `rankings` — names allowed), podium (current top standings; real event-end finalisation is MILESTONE-10, so this renders whatever rankings exist so far, not a "final" claim), blank.
- **FR-061** (no player-entered content unless the Operator's selected view includes it): enforced client-side — only the results/leaderboard views render participant/team names; every other view never does. The underlying data already reaches the screen regardless of `display` (same broadcast every connection gets); this is a rendering discipline, not new server-side filtering.
- **FR-063** (reconnect renders current state, not a replay): `RoomState` gains a cached `lastStepResults`/`lastRankings` (the most recent broadcast of each), resent on every connect/reconnect alongside `state` — cleared for `lastStepResults` when a new step starts (so a reconnect never shows a stale prior step's results), kept indefinitely for `lastRankings` (a cumulative total is never stale, only superseded). This incidentally closes the same gap MILESTONE-08's design.md flagged and deferred for players — not this milestone's primary goal, but a natural consequence of the same fix.
- **Operator caster**: a "cast to screen" control on the MC console page using the browser's Presentation API when available (`window.PresentationRequest`, Chrome/Edge desktop per NFR-015), falling back to a plain new-window open when it isn't (e.g. no secondary display detected) — either way the receiving window is the same authenticated browser session.

## Capabilities

### New Capabilities
- `mc-console`: the admin's flow-control UI — claiming control and driving the commands that exist so far (`mc:start`/`mc:advance`/`mc:lock`/`mc:reveal`).
- `big-screen`: the screen role, the seven display views, the Operator's view-switching control, and the Presentation API caster.

### Modified Capabilities
- `event-room`: adds the `screen` connection role and the `operator:display` command; adds cached last-broadcast results/rankings for reconnect (FR-063).

## Impact

- `apps/party/src/EventRoom.ts`: `screen` role resolution (reusing an admin JWT + a `?screen=1` query flag — see design.md D1), `operator:display` handler, `RoomState.lastStepResults`/`lastRankings` caching + resend-on-connect.
- `packages/shared`: `RoomRole` gains `"screen"`; `RoomState` gains `lastStepResults`/`lastRankings`; `protocol.ts` gains `OperatorDisplayCommand`.
- `apps/web/src/routes/ScreenRoute.tsx`: replaced with the real receiver (currently a dev-only ping placeholder).
- `apps/web/src/routes/admin/`: new `LiveControlPage.tsx` (MC console + caster + `operator:display` buttons), reachable from `EventEditorPage`; new big-screen view components.
- `apps/web/src/routes/player/useEventRoom.ts`: reused for the screen connection too (adds an optional "connect as screen" flag) rather than duplicating the WebSocket hook.
- No new Postgres migration — `event.waiting_media_path`/`waiting_countdown_target` (MILESTONE-04) already carry everything the waiting view needs; the screen reads them via the same admin-authenticated `event` table read (RLS already allows `is_admin()`), not the player-facing `event_public_summary` view (which deliberately excludes them).
- Depends on MILESTONE-07 (`live-mcq-round`, merged — `RoomState.display`, question/step broadcast) and MILESTONE-08 (`scoring-engine-persistence`, merged — `step_results`/`rankings` broadcast this milestone's results/leaderboard views consume).
