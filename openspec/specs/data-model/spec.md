# data-model Specification

## Purpose

The Postgres schema and row-level-security access-control model that is the system of record for events, teams, participants, answers, and results — and the boundary that keeps every client (anonymous, player, or admin) confined to the data it is allowed to see or change, independent of any application code in front of it.

## Requirements

### Requirement: Schema models one live-event quiz session end to end

The system SHALL persist, via a versioned migration that applies cleanly against an empty database, the full data model needed for one live-event quiz: events, their ordered steps, MCQ question content, teams, participants, submitted answers, per-step results, and final per-event standings (SPEC.md §7.3). Every table scoped to a specific event SHALL carry a reference to that event.

#### Scenario: Migration applies from empty

- **WHEN** the migrations are applied to a freshly created, empty database
- **THEN** every table and view in the data model exists and the migration reports success

#### Scenario: Event-scoped rows are traceable to their event

- **WHEN** a step, team, participant, answer, or result row is inspected
- **THEN** it references the specific event it belongs to

### Requirement: At most one event is live at a time

The system SHALL prevent more than one event from being in `live` status simultaneously.

#### Scenario: A second live event is rejected

- **WHEN** an event is already `live` and a write attempts to set a second event's status to `live`
- **THEN** the write is rejected

### Requirement: A participant answers a given step at most once

The system SHALL prevent a participant from submitting more than one answer for the same step.

#### Scenario: Duplicate answer is rejected

- **WHEN** a participant has already submitted an answer for a step and submits a second answer for the same step
- **THEN** the second submission is rejected

### Requirement: Season standings aggregate across events

The system SHALL expose a read model that sums each identified account holder's total points across all of that season's events, excluding anonymous and deleted profiles.

#### Scenario: Season totals sum correctly

- **WHEN** an account holder has final results recorded in more than one event within the same season
- **THEN** the season standings read model reports their summed total across those events

#### Scenario: Anonymous participants are excluded

- **WHEN** an anonymous (guest) participant has final results recorded
- **THEN** the season standings read model does not include their points

### Requirement: Unauthenticated requests are denied

The system SHALL deny every read and write against event, participant, and result data to a request that carries no valid identity.

#### Scenario: No-JWT request is denied

- **WHEN** a request with no authentication token attempts to read or write any table in the data model
- **THEN** the request is denied

### Requirement: A player is confined to their own participant data and their event's public content

A player (any authenticated, non-admin identity) SHALL be able to read their own `participant` row and the public, non-answer-bearing content (event, step, team) of the event(s) they are part of, and SHALL NOT be able to read another participant's private data, question/answer content, or any other event's data.

#### Scenario: Player reads their own participant row

- **WHEN** a player reads their own `participant` row
- **THEN** the read succeeds

#### Scenario: Player cannot read another participant's row

- **WHEN** a player attempts to read a `participant` row belonging to a different person
- **THEN** the read is denied

#### Scenario: Player reads public content for their own event

- **WHEN** a player reads event, step, or team data for an event they are a participant in
- **THEN** the read succeeds

#### Scenario: Player cannot read another event's data

- **WHEN** a player attempts to read event, step, team, or participant data for an event they are not part of
- **THEN** the read is denied

#### Scenario: Player cannot read question or answer-key content directly

- **WHEN** a player attempts to read a question's content (including the correct answer) directly from the data store, for any step of any event
- **THEN** the read is denied — question content reaches players only through the live real-time channel, which omits the answer key until it is revealed

### Requirement: Event content is admin-authored and locked once the event leaves draft

Only an admin identity SHALL be able to create or modify event, step, question, or team content, and only while the event's status is `draft`. Once an event's status is no longer `draft`, its content becomes read-only to every identity, including admins, so that a running or ended event's questions and structure cannot change underneath it.

#### Scenario: Non-admin write to content is always rejected

- **WHEN** a player attempts to create or modify event, step, question, or team content
- **THEN** the write is rejected regardless of the event's status

#### Scenario: Admin can author content while the event is a draft

- **WHEN** an admin creates or modifies event, step, question, or team content for an event whose status is `draft`
- **THEN** the write succeeds

#### Scenario: Content is locked once the event leaves draft

- **WHEN** an admin attempts to modify event, step, question, or team content for an event whose status is no longer `draft`
- **THEN** the write is rejected

### Requirement: Administrative data is readable only by admins

Data that is not part of an event's public content and not the requester's own participant or profile row — including question/answer content, another participant's full profile, and per-participant answer detail before results are revealed — SHALL be readable only by an admin identity.

#### Scenario: Player cannot read administrative data

- **WHEN** a player attempts to read administrative data belonging to another participant
- **THEN** the read is denied

#### Scenario: Admin can read administrative data

- **WHEN** an admin reads administrative data — including a question's content and correct answer — for any participant, step, or event
- **THEN** the read succeeds

### Requirement: Admin status is granted out-of-band, never through a self-service path

No application-writable path SHALL be able to set an identity's admin status. Admin status SHALL be established only by a direct, auditable operation outside normal request handling, applied to exactly the intended accounts.

#### Scenario: Signing up never grants admin status

- **WHEN** a new account is created through any self-service path (anonymous or email/password)
- **THEN** the resulting identity does not have admin status

#### Scenario: Designated admin accounts have admin status

- **WHEN** the two accounts designated as administrators are inspected after provisioning
- **THEN** both have admin status and no other account does

### Requirement: `join_event` is the sole path for a player to create their own participant row

The system SHALL expose a server-side operation, callable by any authenticated identity (anonymous or account), that validates a join code, checks the requested display name against the profanity wordlist, and creates — or idempotently returns — the caller's `participant` row for that event. No other path SHALL let a non-admin identity insert a `participant` row directly. When the caller is consenting for the first time, the same operation SHALL record that consent (16+ affirmation and Terms/Privacy acceptance timestamp) and the marketing-consent choice against the caller's `profile`.

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

### Requirement: An event's public summary is readable without authentication

Before choosing an identity, a prospective player SHALL be able to read a non-administrative summary of an event by its join code — sufficient to confirm the code resolves to a joinable event — without holding any session. This summary SHALL NOT include administrative fields (e.g. who created the event, waiting-screen media, the current step).

#### Scenario: Unauthenticated request reads the public summary

- **WHEN** a request with no session reads the public event summary by join code
- **THEN** the event's public, non-administrative fields are returned

#### Scenario: Administrative fields are absent from the public summary

- **WHEN** the public event summary is inspected
- **THEN** it carries no administrative field of the event (creator, waiting-screen media, current step, or similar)

### Requirement: Local development seeds to a usable state

The system SHALL provide fixture data that leaves a freshly reset local database in a state usable for manual and automated testing, without requiring any manual data entry first.

#### Scenario: Reset leaves queryable fixtures

- **WHEN** the local database is reset and re-seeded
- **THEN** at least one event with participants exists and is queryable
