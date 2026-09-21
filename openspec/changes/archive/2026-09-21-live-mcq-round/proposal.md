## Why

MILESTONE-05 built the EventRoom's connection/state/lock foundation and MILESTONE-06 built team formation, but nothing yet actually runs a quiz: there's no way for the flow-controller to start an event, advance through its steps, or lock a timer, and no way for a player to see a question or submit an answer. SPEC.md §8 "MILESTONE-07: Live MCQ round" is next in the milestone sequence and depends on the already-merged MILESTONE-05 (event-room-core) and MILESTONE-06 (team-lobby).

**Housekeeping note**: `event-authoring-console` (MILESTONE-04), `event-room-core` (MILESTONE-05), and `team-lobby` (MILESTONE-06) are all merged to `main` but not yet archived — their delta specs haven't been synced into `openspec/specs/`. This proposal's capability listing below reflects that: `event-room` and `live-game` are marked "new" because no main spec exists for them yet under `openspec/specs/`, even though `event-room` conceptually continues `event-room-core`'s work. Archiving the backlog is a separate step the user can trigger whenever convenient — not part of this change.

## What Changes

**EventRoom (`apps/party`)** — three new flow-control commands and answer submission:
- `mc:start` (flow-controller only): writes `event.status = 'live'` to Postgres via the service-role client — the Durable Object's first-ever Postgres *write* (this corrects an assumption in MILESTONE-05's design.md, which expected the first DO→Postgres write to be MILESTONE-08's scoring flush; team lock/dissolution already fires for free via MILESTONE-06's trigger on this same status transition), sets `season_year` to the current calendar year (a simple placeholder — real season-boundary derivation is MILESTONE-13's explicit scope), transitions step 1 to `active` with `timer_started_at = now`, and schedules a Durable Object alarm for the step's expiry if timed.
- `mc:advance` (flow-controller only): current step → `done`, next step → `active` with a fresh timer and alarm. Idempotent. Rejects with `no_next_step` on the last step — ending the event (`mc:end`) is MILESTONE-10's scope, so this milestone needs a defined terminal behavior rather than silently absorbing the case.
- `mc:lock` (flow-controller only): current step → `locked`. Also fires automatically via the DO alarm at `timer_started_at + countdown_seconds` plus a fixed grace — expiry locks input but never auto-advances the flow (FR-044).
- `answer:submit` (`{stepId, optionId}`, player only): rejects a non-`active` step, a submission past expiry+grace (checked fresh at submission time — the real enforcement, independent of whether the alarm has fired), or a duplicate answer for that participant/step. Accepted answers are written to the Durable Object's *own* SQLite storage immediately (not Postgres — the Postgres `answer` table isn't touched until MILESTONE-08's `mc:reveal` flush, once scoring exists to compute `is_correct`/`scored_points`), stamped with a server receipt time and a genuinely monotonic `receipt_seq`. The submitter gets a lightweight `answer_ack` — a protocol addition beyond SPEC.md's literal table, needed so the client has positive confirmation distinct from silence.
- The `state` broadcast now also carries the current step's question text and options (never the correct answer) — the existing `state` message doesn't carry this at all yet, and players need it to render the question view.

**Player UI (`apps/web`)** — the first real-time surface in the player app:
- A WebSocket client hook (`partysocket`, an unused dependency since the MILESTONE-01 scaffold) connecting once a player reaches the team-lobby step, reconciling to the server's snapshot.
- Once the event goes live, the team-lobby view is replaced by a live-game view: a lightweight waiting view (countdown/branding only — no media, that's big-screen-only per FR-064) between steps; a question view once a step is active (select one option, then an explicit confirm sends `answer:submit`); a holding view once answered or locked (no result yet — reveal is MILESTONE-08).
- Client-side hard lock at expiry: computed independently from the snapshot's server-clock offset, not only from the server's `locked` broadcast — belt-and-suspenders with server-side rejection.

**Out of scope** (later milestones per SPEC.md §8): `mc:reveal`/`mc:show_leaderboard`/`mc:end` and the rest of FR-033's command set — MILESTONE-10; scoring computation and the Postgres `answer`/`step_result_*` flush — MILESTONE-08; the big screen's real views and Operator casting (`ScreenRoute.tsx` stays a placeholder) — MILESTONE-09; `mc:kill_switch` — MILESTONE-11; real season-year derivation — MILESTONE-13.

## Capabilities

### New Capabilities
- `event-room`: continues `event-room-core`'s (MILESTONE-05, unarchived) capability — adds the game-flow commands (`mc:start`/`mc:advance`/`mc:lock`), the timer-alarm mechanism, and `answer:submit`.
- `live-game`: the player-facing live-gameplay experience — connecting once live, the waiting/question/answered views, and client-side timer enforcement.

### Modified Capabilities
(none — no existing main spec under `openspec/specs/` needs a requirement change; `data-model`'s existing "at most one live event" and "event content locked once live" requirements already cover what this milestone relies on)

## Impact

- `apps/party`: `EventRoom.ts` gains three commands, an `onAlarm` handler, and a local SQLite `answer` table; `packages/shared` gains the question/option shape in `RoomState`/`StateMessage` and the new command/ack message types.
- `apps/web`: new WebSocket client hook and live-game view components under `src/routes/player/`; `partysocket` moves from unused scaffold dependency to actually wired in.
- No new Postgres migration — `event.status`/`season_year` and the existing `step`/`game_mcq` schema already carry everything this milestone needs to read and write (the one new write, `event.status`/`season_year`, uses the existing admin/service-role path, no new RLS).
