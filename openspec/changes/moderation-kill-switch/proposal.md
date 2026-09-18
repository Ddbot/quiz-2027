## Why

A live event needs two safety nets that nothing built so far provides: a way to stop an inappropriate name or team from ever reaching the big screen or the final rankings (moderation), and a way for any admin to instantly blank every screen and phone if something goes wrong mid-event (a kill switch). Both are cheap, well-scoped MVP requirements (FR-039, FR-069..FR-071) and MILESTONE-11 is the first milestone where their dependencies (`team-lobby`, `big-screen`) are both merged.

## What Changes

- A shared (`packages/shared`) FR+EN profanity wordlist module, used by the web client for instant at-entry validation on display-name and team-name forms — a UX improvement layered in front of the existing, unchanged, authoritative Postgres `is_profane()` check (MILESTONE-03/06). The shared module's word list is the single source of truth; the `profanity_word` table migration seeds from the same literal list, so the two can't silently drift.
- New `moderate_participant`/`moderate_team` Postgres RPCs (admin-only, callable regardless of `event.status`) letting an admin hide/show or rename any participant or team; a rename is still checked against `is_profane()`.
- A new "Modération" section on the admin console's live-control page: a roster of participants and teams for the event, with per-row hide/show and rename controls, calling the two new RPCs. Available before and during an event (not gated on `eventStatus`, mirroring the RPCs).
- A new `mc:kill_switch` WebSocket command (any admin, like `mc:claim_control`/`operator:display` — not flow-controller-gated), broadcasting a blank/freeze directive to every connection (screens AND players, not just `role: screen`) via a new `RoomState.killSwitch` boolean, independent of `display`/the current step so clearing it restores exactly what was showing underneath. A new kill-switch toggle on the live-control page triggers it. While active, `answer:submit` is also rejected server-side (defensive: the client is already blanked, but the server shouldn't silently accept an answer nobody could see submitting).
- The big screen and the player-facing connected view both render a full blanking overlay whenever `killSwitch` is true, taking priority over whatever `display`/game view would otherwise show.
- `EventRoom`'s `computeRankings` and `mc:reveal`'s results broadcast now exclude hidden participants/teams from the `rankings`/`step_results` messages (which feed the big screen), without renumbering the surviving ranks — while continuing to score, persist, and count hidden entities' answers exactly as before (nothing is excluded from `answer`/`step_result_*`/`event_final_*`, or from a team's total when a hidden individual is one of its scoring members). A hide/rename's effect on an already-broadcast/cached leaderboard is visible from the next `mc:reveal`/`mc:show_leaderboard`, not retroactively.

## Capabilities

### New Capabilities

(none — every requirement this milestone extends an existing capability)

### Modified Capabilities

- `onboarding`: the existing display-name profanity requirement gains a client-side instant-feedback companion to the unchanged server-side check.
- `team-lobby`: the existing team-name profanity requirement gains the same client-side companion, for both create and rename.
- `data-model`: new admin-only `moderate_participant`/`moderate_team` RPCs, usable regardless of event status, enforcing the profanity check on rename.
- `event-room`: new `mc:kill_switch` command and `RoomState.killSwitch` field; `answer:submit` rejected while active; `rankings`/`step_results` broadcasts exclude hidden participants/teams.
- `mc-console`: new roster moderation section (hide/show, rename) and kill-switch toggle.
- `big-screen`: renders a blanking overlay while the kill switch is active.
- `live-game`: the player's connected view renders the same blanking overlay while the kill switch is active.

## Impact

- `packages/shared`: new profanity-wordlist module; `RoomState`/protocol additions (`killSwitch`, `McKillSwitchCommand`).
- `supabase/migrations/`: one new migration (`moderate_participant`/`moderate_team` RPCs; no new columns — `hidden` already exists since MILESTONE-02).
- `apps/party/src/EventRoom.ts`: new `mc:kill_switch` handler; `answer:submit`/`computeRankings`/`mc:reveal` gain the kill-switch and hidden-filtering behavior.
- `apps/web/src/routes/admin/LiveControlPage.tsx` (+ a new roster component): moderation section, kill-switch toggle.
- `apps/web/src/routes/ScreenViews.tsx`, `apps/web/src/routes/player/OnboardingFlow.tsx`/`LiveGameView.tsx`: blanking overlay.
- `apps/web/src/routes/player/OnboardingFlow.tsx` (join form), team-lobby form component: client-side profanity check wired in ahead of the RPC call.
