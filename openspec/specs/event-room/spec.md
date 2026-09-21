# event-room Specification

## Purpose

The EventRoom Durable Object's connection lifecycle and authoritative state: verifying who is connecting, assigning them a role, holding the event's live state, keeping every connection in sync with it, and making sure exactly one admin identity drives the event's flow at a time — the foundation every live-event milestone (team lobby, MCQ rounds, scoring, big screen, reveal) is built on.

## Requirements

### Requirement: A connection is authenticated by its Supabase JWT

The EventRoom SHALL verify the JWT presented on connect against the Supabase JWKS endpoint before accepting the connection, and SHALL reject a connection whose token is missing, malformed, or fails signature verification.

#### Scenario: Valid JWT is accepted

- **WHEN** a client opens a WebSocket connection presenting a JWT that verifies against the Supabase JWKS endpoint
- **THEN** the connection is accepted and proceeds to role assignment

#### Scenario: Missing or invalid JWT is rejected

- **WHEN** a client opens a WebSocket connection with no token, a malformed token, or a token that fails signature verification
- **THEN** the connection is rejected before any event state is shared

### Requirement: An authenticated connection is assigned a role

Once a connection's JWT is verified, the EventRoom SHALL resolve the caller's profile (`profile_id`, `is_anonymous`, `is_admin`) and, for a non-admin identity, the caller's `participant` row for this event, then assign `role ∈ {player, admin}`. A non-admin identity with no `participant` row for this event SHALL be rejected.

#### Scenario: An admin identity connects as admin

- **WHEN** a verified connection's profile has `is_admin = true`
- **THEN** the connection is assigned the `admin` role

#### Scenario: A joined player connects as player

- **WHEN** a verified connection's profile is not an admin and has a `participant` row for this event
- **THEN** the connection is assigned the `player` role

#### Scenario: A non-admin with no participant for this event is rejected

- **WHEN** a verified connection's profile is not an admin and has no `participant` row for this event
- **THEN** the connection is rejected

### Requirement: The Durable Object holds authoritative live event state

The EventRoom SHALL maintain the event's authoritative state — event status, the current step's summary, the current display directive, and the identity currently holding flow control — as the single source of truth for every connected client.

#### Scenario: State reflects the event's current status and step

- **WHEN** the EventRoom's held state is inspected
- **THEN** it reports the event's current status and, if any, the current step's identifier, position, timer configuration, and status

### Requirement: A full state snapshot is sent on connect and reconnect

On every successful connection (including a reconnect), the EventRoom SHALL send that connection a full snapshot of the authoritative state together with a server clock reference, and the snapshot SHALL match the state held at that moment.

#### Scenario: A newly connected client receives a snapshot

- **WHEN** a client's connection is accepted and assigned a role
- **THEN** it immediately receives a state message containing the current authoritative state and a server clock reference

#### Scenario: A reconnecting client's snapshot matches current state

- **WHEN** a client that was previously connected reconnects after the state has changed
- **THEN** the snapshot it receives on reconnect matches the state as currently held, not the state at the time of its earlier connection

### Requirement: State changes are broadcast to every connected client

Whenever the authoritative state changes, the EventRoom SHALL push the updated state to every currently connected client.

#### Scenario: A state change reaches all connections

- **WHEN** the authoritative state changes while more than one client is connected
- **THEN** every connected client receives the updated state

### Requirement: Flow-control commands are accepted only from the current controller

The EventRoom SHALL track flow control as a stable identity (not a transient connection), and SHALL accept a flow-control command only from the connection whose identity currently holds it, rejecting it from any other connection — including another admin who does not currently hold control.

#### Scenario: The current controller's command is accepted

- **WHEN** the connection whose identity currently holds flow control sends a flow-control command
- **THEN** the command is accepted

#### Scenario: A non-controller's command is rejected

- **WHEN** a connection whose identity does not currently hold flow control sends a flow-control command
- **THEN** the command is rejected

### Requirement: Any admin may claim flow control

The EventRoom SHALL accept an `mc:claim_control` command from any admin connection, transferring flow control to that admin's identity while leaving all other state intact.

#### Scenario: An admin claims control

- **WHEN** an admin connection sends `mc:claim_control`
- **THEN** flow control transfers to that admin's identity and the rest of the event state is unchanged

#### Scenario: A non-admin cannot claim control

- **WHEN** a non-admin connection sends `mc:claim_control`
- **THEN** the command is rejected and flow control does not change

### Requirement: An admin resumes flow control across reconnects without losing state

Because flow control is tracked by identity rather than by connection, an admin who holds flow control and then disconnects and reconnects SHALL still be recognized as the controller, with the event's state and scores intact.

#### Scenario: Reconnecting under the same identity preserves control

- **WHEN** the admin identity currently holding flow control disconnects and then reconnects
- **THEN** that identity still holds flow control and the event's state is unchanged

### Requirement: State transitions are idempotent

A repeated or rapid duplicate of a state-changing command SHALL NOT change the outcome beyond its first effective application — no double-advance, no skipped state, and no duplicate broadcast for a mutation that made no actual change.

#### Scenario: A repeated command has no additional effect

- **WHEN** a state-changing command is received again with no state change to make (e.g. an admin reclaims flow control they already hold)
- **THEN** the state is unchanged and no additional broadcast is sent beyond the first application

### Requirement: Event state survives Durable Object eviction

The EventRoom SHALL persist its authoritative state so that if the underlying Durable Object instance is evicted and later recreated, the recreated instance recovers the same state rather than resetting it.

#### Scenario: A recreated instance recovers persisted state

- **WHEN** a new EventRoom instance is constructed for an event whose state was previously persisted
- **THEN** the recreated instance's state matches what was last persisted, not a fresh default

### Requirement: The flow-controller can start the event

The system SHALL accept `mc:start` only from the connection currently holding flow control, and only while the event is `draft`. On success, the event transitions to `live`, its first step transitions to `active` with a timer start time, and a timer is scheduled if the step is timed.

#### Scenario: The flow-controller starts the event

- **WHEN** the connection holding flow control sends `mc:start` for a draft event
- **THEN** the event becomes `live` and its first step becomes `active` with a timer start time recorded

#### Scenario: A non-controller cannot start the event

- **WHEN** a connection that does not hold flow control sends `mc:start`
- **THEN** the command is rejected and the event remains `draft`

### Requirement: The flow-controller can advance to the next step

The system SHALL accept `mc:advance` only from the connection holding flow control, and only while an event is `live`. On success, the current step transitions to `done` and the next step transitions to `active` with a fresh timer start time. Advancing past the last step is rejected rather than silently ending the event.

#### Scenario: Advancing moves to the next step

- **WHEN** the flow-controller sends `mc:advance` while a step is active and a next step exists
- **THEN** the current step becomes `done` and the next step becomes `active` with a new timer start time

#### Scenario: Advancing past the last step is rejected

- **WHEN** the flow-controller sends `mc:advance` while the active step is the event's last step
- **THEN** the command is rejected and no step transition occurs

#### Scenario: A repeated advance does not double-advance

- **WHEN** `mc:advance` is received again with no step to newly transition (already applied)
- **THEN** the state is unchanged and no additional transition occurs

### Requirement: A step's answer window locks explicitly or automatically at expiry

The system SHALL accept `mc:lock` only from the connection holding flow control, transitioning the active step to `locked`. Independently, once a timed step's countdown plus a fixed grace period elapses, the system SHALL transition that step to `locked` on its own, without requiring any client command and without advancing to another step.

#### Scenario: The flow-controller locks the step explicitly

- **WHEN** the flow-controller sends `mc:lock` while a step is active
- **THEN** the step transitions to `locked`

#### Scenario: A timed step locks automatically at expiry

- **WHEN** a timed step's countdown plus grace period elapses with no explicit lock
- **THEN** the step transitions to `locked` on its own and the flow does not advance to another step

### Requirement: A player submits at most one answer per step, only while it accepts answers

The system SHALL accept `answer:submit` only from a player connection, only while the target step is `active`, and only before its timer expiry plus grace (for a timed step). It SHALL reject a second answer from the same participant for the same step. An accepted answer SHALL be durably recorded before the submission is acknowledged, stamped with a server receipt time and a monotonically increasing receipt sequence number.

#### Scenario: A valid answer is accepted

- **WHEN** a player submits an answer for the currently active step, before expiry, having not already answered it
- **THEN** the answer is durably recorded and the player receives acknowledgment

#### Scenario: An answer for a non-active step is rejected

- **WHEN** a player submits an answer for a step that is not `active`
- **THEN** the submission is rejected

#### Scenario: A late answer is rejected

- **WHEN** a player submits an answer for a timed step after its expiry plus grace period has elapsed
- **THEN** the submission is rejected, even if the step has not yet been marked `locked`

#### Scenario: A duplicate answer is rejected

- **WHEN** a player who has already submitted an answer for a step submits another for the same step
- **THEN** the second submission is rejected and the first answer is unchanged

### Requirement: The state broadcast includes the active step's question content, never the answer key

Once a step is active, the authoritative state broadcast to every connection SHALL include that step's question text and answer options, and SHALL NOT include which option is correct.

#### Scenario: Connected clients receive the question content

- **WHEN** a step becomes active
- **THEN** every connected client's state includes that step's question text and options

#### Scenario: The correct option is never broadcast

- **WHEN** the state for an active, locked, or done step is inspected by any connection
- **THEN** it does not reveal which option is correct

### Requirement: The flow-controller can reveal a step's result

The system SHALL accept `mc:reveal` only from the connection currently holding flow control, and only for a step that is already `locked`. On success, the system SHALL run the scoring module against that step's accepted answers, persist the results, and transition the step to `revealed`.

#### Scenario: The flow-controller reveals a locked step

- **WHEN** the connection holding flow control sends `mc:reveal` for a step that is `locked`
- **THEN** the step's results are computed and the step transitions to `revealed`

#### Scenario: A non-controller cannot reveal a step

- **WHEN** a connection that does not hold flow control sends `mc:reveal`
- **THEN** the command is rejected and the step's status is unchanged

#### Scenario: Revealing a step that is not locked is rejected

- **WHEN** the flow-controller sends `mc:reveal` for a step that is still `active` or has no current step at all
- **THEN** the command is rejected and no results are computed

#### Scenario: A repeated reveal does not recompute results

- **WHEN** `mc:reveal` is received again for a step that is already `revealed`
- **THEN** no additional computation or broadcast occurs

### Requirement: Revealed results are broadcast without the answer key, and each player privately learns their own result

Once a step is revealed, the system SHALL broadcast every connection the step's per-participant and per-team results (correctness and points; team average, winner status, and award) without indicating which option was correct, SHALL broadcast the event's cumulative individual and team rankings, and SHALL separately send each player a private message describing only their own outcome for that step.

#### Scenario: Connected clients receive the step's results and current rankings

- **WHEN** a step is revealed
- **THEN** every connected client receives that step's per-participant and per-team results and the event's current cumulative rankings

#### Scenario: The broadcast results never reveal which option was correct

- **WHEN** the step results broadcast is inspected by any connection
- **THEN** it does not indicate which answer option was correct

#### Scenario: A player receives their own result privately

- **WHEN** a step is revealed
- **THEN** each player receives a private message with only their own correctness and points for that step

### Requirement: Reveal persists results to Postgres with retry, never relying on Durable Object memory alone

On reveal, the system SHALL write the step's answers (with computed correctness and points) and step results to the Postgres system of record, retrying with backoff on a transient failure without blocking the live flow for other connections.

#### Scenario: A transient Postgres failure during flush is retried

- **WHEN** the Postgres write during a reveal fails transiently
- **THEN** the system retries with backoff and the flush eventually succeeds, without the live event flow stalling for connected clients

### Requirement: A connection can authenticate as the screen role

The system SHALL assign the `screen` role to a connection that presents a valid admin identity together with a screen-connection flag, instead of the `admin` role it would otherwise receive. A screen connection SHALL be render-only: it SHALL NOT be permitted to invoke any command reserved for the flow-controller or for admins generally.

#### Scenario: An admin connection requesting the screen role receives it

- **WHEN** a connection presenting a valid admin identity also presents the screen-connection flag
- **THEN** the connection's role is `screen`, not `admin`

#### Scenario: A screen connection cannot invoke admin-only commands

- **WHEN** a connection with the `screen` role sends a command reserved for an admin (such as `operator:display` or a flow-control command)
- **THEN** the command is rejected

### Requirement: Any admin can set the big-screen display directive

The system SHALL accept `operator:display` from any admin connection (not gated to the flow-control lock), setting which view every `screen` connection should currently render. The value SHALL be one of: waiting, question, collecting, results, leaderboard, podium, or blank.

#### Scenario: An admin sets the display directive

- **WHEN** an admin connection sends `operator:display` with a valid view
- **THEN** the authoritative state's display value changes accordingly and every connection is notified

#### Scenario: An admin without flow control can still set the display directive

- **WHEN** an admin who does not currently hold the flow-control lock sends `operator:display`
- **THEN** the command still succeeds

#### Scenario: An invalid display value is rejected

- **WHEN** `operator:display` is sent with a value that is not one of the recognized views
- **THEN** the command is rejected and the display value is unchanged

### Requirement: A reconnecting client receives the current step's results and rankings, not a replay of missed ones

The system SHALL retain the most recently broadcast step results and the most recently broadcast rankings, and SHALL resend both to any connection on connect or reconnect, alongside the authoritative state snapshot. The retained step results SHALL be cleared whenever a new step becomes active, so a reconnecting client never sees a prior step's results attributed to the current one; the retained rankings SHALL persist across step transitions, since a cumulative total is never stale, only superseded by a later one.

#### Scenario: A reconnecting client sees the current step's results

- **WHEN** a client connects or reconnects after the current step has been revealed
- **THEN** it receives that step's results and the current rankings alongside its state snapshot

#### Scenario: A reconnecting client does not see a previous step's results after advancing

- **WHEN** a client connects or reconnects after a new step has become active, following an earlier step's reveal
- **THEN** it does not receive the earlier step's results

#### Scenario: A reconnecting client sees current rankings even before the current step is revealed

- **WHEN** a client connects or reconnects while a new step is active but not yet revealed, after an earlier step already contributed to the rankings
- **THEN** it still receives the rankings as they stood after the most recent reveal

### Requirement: The flow-controller can show the cumulative leaderboard on demand

The system SHALL accept `mc:show_leaderboard` only from the connection currently holding flow control, and only while the event is `live`. On success it SHALL recompute the event's cumulative individual and team rankings, set the display directive to the leaderboard view, and broadcast both to every connection.

#### Scenario: The flow-controller shows the leaderboard

- **WHEN** the flow-controller sends `mc:show_leaderboard` for a live event
- **THEN** every connection receives the current cumulative rankings and the display directive changes to the leaderboard view

#### Scenario: A non-controller cannot show the leaderboard

- **WHEN** a connection that does not hold flow control sends `mc:show_leaderboard`
- **THEN** the command is rejected and the display directive is unchanged

### Requirement: The flow-controller can end the event, finalising its rankings

The system SHALL accept `mc:end` only from the connection currently holding flow control, and only while the event is `live`. On success it SHALL compute and persist final individual and team rankings, transition the event to permanently ended, and make those final rankings available to every connection.

#### Scenario: The flow-controller ends the event

- **WHEN** the flow-controller sends `mc:end` for a live event
- **THEN** the event transitions to ended and its final individual and team rankings are persisted

#### Scenario: Ending an event that is not live is rejected

- **WHEN** `mc:end` is sent for an event that is still a draft, or already ended
- **THEN** the command is rejected and no finalisation occurs

#### Scenario: A non-controller cannot end the event

- **WHEN** a connection that does not hold flow control sends `mc:end`
- **THEN** the command is rejected

### Requirement: Once an event has ended, its game-progress commands are permanently rejected

Once an event has ended, the system SHALL reject any attempt to lock a step, reveal a step's results, or submit an answer — including one already scheduled to occur automatically (such as a pending timer-expiry lock) — while continuing to allow the display directive to be changed and flow control to be claimed, so the event's outcome can still be presented.

#### Scenario: Locking a step is rejected after the event has ended

- **WHEN** `mc:lock` is sent for an event that has already ended
- **THEN** the command is rejected and no step transition occurs

#### Scenario: Revealing a step is rejected after the event has ended

- **WHEN** `mc:reveal` is sent for an event that has already ended
- **THEN** the command is rejected and no results are computed

#### Scenario: Submitting an answer is rejected after the event has ended

- **WHEN** `answer:submit` is sent for an event that has already ended
- **THEN** the submission is rejected

#### Scenario: The display directive can still be changed after the event has ended

- **WHEN** `operator:display` is sent for an event that has already ended
- **THEN** the display directive still changes, so the final podium can still be shown

### Requirement: Any admin can trigger the kill switch, blanking every connection

The system SHALL accept `mc:kill_switch` from any admin connection (not flow-controller-gated, like `mc:claim_control` and `operator:display`), regardless of the event's status. On success it SHALL broadcast a blank/freeze directive to every connection — screens and players alike — independently of the current `display`/step state, and a matching command SHALL clear it, restoring exactly what was showing underneath with no residue.

#### Scenario: An admin activates the kill switch

- **WHEN** any admin sends `mc:kill_switch` with `{ on: true }`
- **THEN** every connected screen and player device receives the blank/freeze directive

#### Scenario: An admin clears the kill switch

- **WHEN** any admin sends `mc:kill_switch` with `{ on: false }` after it was active
- **THEN** every connection stops showing the blank/freeze directive and resumes showing whatever the current `display`/step state indicates, unchanged since before the kill switch was activated

#### Scenario: A non-admin cannot trigger the kill switch

- **WHEN** a non-admin connection sends `mc:kill_switch`
- **THEN** the command is rejected and no directive is broadcast

### Requirement: Answer submission is rejected while the kill switch is active

Once the kill switch is active, the system SHALL reject `answer:submit`, in addition to blanking the submitting player's own view.

#### Scenario: An answer is rejected while the kill switch is active

- **WHEN** a player sends `answer:submit` while the kill switch is active
- **THEN** the submission is rejected

### Requirement: Hidden participants and hidden teams are excluded from cumulative rankings and step-results broadcasts

The `rankings` and `step_results` messages — which feed the big-screen leaderboard, podium, and results views — SHALL exclude any participant or team currently marked hidden, without renumbering the rank of the entities that remain. Their answers and scores SHALL continue to be computed, persisted, and counted exactly as for any other participant or team, including toward a team's total when a hidden individual is one of its scoring members.

#### Scenario: A hidden participant does not appear in the broadcast rankings

- **WHEN** cumulative rankings are recomputed and broadcast (`mc:reveal` or `mc:show_leaderboard`) for an event with a hidden participant
- **THEN** that participant does not appear in the `rankings` message's individual standings, and the remaining participants keep the ranks they would have had including the hidden one

#### Scenario: A hidden team does not appear in the broadcast rankings

- **WHEN** cumulative rankings are recomputed and broadcast for an event with a hidden team
- **THEN** that team does not appear in the `rankings` message's team standings

#### Scenario: A hidden participant's answers and scores are still recorded and counted

- **WHEN** a hidden participant answers a step, including one who is a member of a non-hidden team
- **THEN** their answer and per-step result are persisted exactly as for any other participant, and their points still count toward their team's total

#### Scenario: A hidden participant does not appear in the broadcast step results

- **WHEN** a step is revealed for an event with a hidden participant
- **THEN** that participant does not appear in the `step_results` message's participant list
