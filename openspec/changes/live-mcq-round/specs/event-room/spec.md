## Purpose

The EventRoom's game-flow commands and answer collection: starting an event, advancing and locking its steps under timer authority, and accepting a player's one answer per step — continuing `event-room-core`'s (MILESTONE-05) connection/state/lock foundation.

## ADDED Requirements

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
