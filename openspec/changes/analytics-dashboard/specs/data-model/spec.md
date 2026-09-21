## MODIFIED Requirements

### Requirement: `join_event` is the sole path for a player to create their own participant row

The system SHALL expose a server-side operation, callable by any authenticated identity (anonymous or account), that validates a join code, checks the requested display name against the profanity wordlist, and creates — or idempotently returns — the caller's `participant` row for that event. No other path SHALL let a non-admin identity insert a `participant` row directly. When the caller is consenting for the first time, the same operation SHALL record that consent (16+ affirmation and Terms/Privacy acceptance timestamp) and the marketing-consent choice against the caller's `profile`. When a new `participant` row is created, the operation SHALL record which step of the event was current at that moment (or none, if the event has not started), as the basis for later measuring how much of the event that participant was present for.

#### Scenario: Valid join creates a participant

- **WHEN** an authenticated identity calls the join operation with a join code that resolves to a joinable event and an acceptable display name
- **THEN** a `participant` row is created for that identity and event, and is returned

#### Scenario: First-time consent is recorded on the profile

- **WHEN** the join operation is called with the age affirmation and Terms/Privacy acceptance for an identity that has not consented before
- **THEN** the caller's `profile` records the 16+ affirmation, a Terms/Privacy acceptance timestamp, and the marketing-consent choice

#### Scenario: Repeated join is idempotent

- **WHEN** an identity that already has a `participant` for an event calls the join operation for that same event again
- **THEN** the existing `participant` is returned and no duplicate row is created

#### Scenario: Invalid join code is rejected

- **WHEN** the join operation is called with a code that does not resolve to a joinable event
- **THEN** it is rejected with an error identifying the invalid code, and no `participant` row is created

#### Scenario: Non-joinable event is rejected

- **WHEN** the join operation is called for an event whose status does not permit joining
- **THEN** it is rejected with an error identifying the event as not joinable, and no `participant` row is created

#### Scenario: Profane display name is rejected

- **WHEN** the join operation is called with a display name matching the profanity wordlist
- **THEN** it is rejected with an error identifying the profanity match, and no `participant` row is created

#### Scenario: Direct participant insert outside the join operation is denied

- **WHEN** a non-admin identity attempts to insert a `participant` row directly rather than through the join operation
- **THEN** the insert is denied

#### Scenario: Joining before the event starts records no particular step

- **WHEN** the join operation creates a new `participant` for an event that has not yet started
- **THEN** the recorded step is none, so that participant is later counted as present for every step

#### Scenario: Joining after the event has started records the current step

- **WHEN** the join operation creates a new `participant` for an event that already has a current step
- **THEN** the recorded step is that current step, so that participant is later counted as present only from it onward

## ADDED Requirements

### Requirement: The event's current step is kept current in the system of record

As the flow-controller advances an event from one step to the next, the system SHALL keep the event's record of its current step, and that step's activation time, synchronized in Postgres — not only in the real-time layer that drives clients.

#### Scenario: Starting the event records its first step as current

- **WHEN** the flow-controller starts an event
- **THEN** the event's record of its current step identifies the first step, with an activation time

#### Scenario: Advancing records the new step as current

- **WHEN** the flow-controller advances a live event to its next step
- **THEN** the event's record of its current step identifies that next step, with a new activation time
