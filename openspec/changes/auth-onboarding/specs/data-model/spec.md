## ADDED Requirements

### Requirement: `join_event` is the sole path for a player to create their own participant row

The system SHALL expose a server-side operation, callable by any authenticated identity (anonymous or account), that validates a join code, checks the requested display name against the profanity wordlist, and creates — or idempotently returns — the caller's `participant` row for that event. No other path SHALL let a non-admin identity insert a `participant` row directly.

#### Scenario: Valid join creates a participant

- **WHEN** an authenticated identity calls the join operation with a join code that resolves to a joinable event and an acceptable display name
- **THEN** a `participant` row is created for that identity and event, and is returned

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

### Requirement: An event's public summary is readable without authentication

Before choosing an identity, a prospective player SHALL be able to read a non-administrative summary of an event by its join code — sufficient to confirm the code resolves to a joinable event — without holding any session. This summary SHALL NOT include administrative fields (e.g. who created the event, waiting-screen media, the current step).

#### Scenario: Unauthenticated request reads the public summary

- **WHEN** a request with no session reads the public event summary by join code
- **THEN** the event's public, non-administrative fields are returned

#### Scenario: Administrative fields are absent from the public summary

- **WHEN** the public event summary is inspected
- **THEN** it carries no administrative field of the event (creator, waiting-screen media, current step, or similar)
