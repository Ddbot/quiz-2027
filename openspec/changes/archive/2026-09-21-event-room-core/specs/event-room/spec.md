## Purpose

The EventRoom Durable Object's connection lifecycle and authoritative state: verifying who is connecting, assigning them a role, holding the event's live state, keeping every connection in sync with it, and making sure exactly one admin identity drives the event's flow at a time — the foundation every live-event milestone (team lobby, MCQ rounds, scoring, big screen, reveal) is built on.

## ADDED Requirements

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
