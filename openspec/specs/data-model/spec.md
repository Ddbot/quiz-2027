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

### Requirement: Multiple events may be live concurrently

The system SHALL allow any number of events to be in `live` status at the same time. There is no system-wide cap on concurrently live events.

#### Scenario: A second live event is accepted while another is already live

- **WHEN** an event is already `live` and a write attempts to set a second, different event's status to `live`
- **THEN** the write succeeds and both events are `live` simultaneously

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

Only an admin identity SHALL be able to create or modify event, step, or question content, and only while the event's status is `draft`. Once an event's status is no longer `draft`, its content becomes read-only to every identity, including admins, so that a running or ended event's questions and structure cannot change underneath it. Team creation and membership are player-driven, not admin-authored content — see the "Team RPCs are the sole path for team-membership and team-name mutations" requirement below for their access-control story.

#### Scenario: Non-admin write to content is always rejected

- **WHEN** a player attempts to create or modify event, step, or question content
- **THEN** the write is rejected regardless of the event's status

#### Scenario: Admin can author content while the event is a draft

- **WHEN** an admin creates or modifies event, step, or question content for an event whose status is `draft`
- **THEN** the write succeeds

#### Scenario: Content is locked once the event leaves draft

- **WHEN** an admin attempts to modify event, step, or question content for an event whose status is no longer `draft`
- **THEN** the write is rejected

### Requirement: Team RPCs are the sole path for team-membership and team-name mutations

The system SHALL expose four server-side operations — creating a team, joining a team, leaving a team, and renaming a team — each callable only by an authenticated identity holding a `participant` row for the event/team in question, and each succeeding only while the event's status is `draft`. No other path SHALL let a non-admin identity write `participant.team_id`, `team.name`, or `team.captain_participant_id` directly. Creating or renaming a team SHALL reject a name that matches the profanity wordlist. Team names SHALL remain unique per event, case-insensitively.

#### Scenario: Creating a team assigns the creator as captain

- **WHEN** an authenticated participant creates a team with an acceptable, available name
- **THEN** a new team is created with that participant as captain, and the participant's `team_id` is set to the new team

#### Scenario: Joining a team has no cap or approval step

- **WHEN** an authenticated participant joins an existing, non-dissolved team for their event
- **THEN** their `team_id` is set to that team, regardless of how many members it already has

#### Scenario: Joining a different team switches the participant

- **WHEN** a participant who already belongs to a team joins a different team
- **THEN** their `team_id` moves to the new team and their prior team's membership no longer includes them

#### Scenario: Leaving a team returns the participant to solo play

- **WHEN** an authenticated participant leaves their team
- **THEN** their `team_id` is set to null

#### Scenario: Only the captain may rename the team

- **WHEN** a participant who is not the team's captain attempts to rename it
- **THEN** the rename is rejected

#### Scenario: A profane team name is rejected

- **WHEN** a team is created or renamed with a name matching the profanity wordlist
- **THEN** the operation is rejected and no name change is made

#### Scenario: A duplicate team name within the same event is rejected

- **WHEN** a team is created or renamed with a name already used (case-insensitively) by another team in the same event
- **THEN** the operation is rejected

#### Scenario: Team mutations are rejected once the event is no longer a draft

- **WHEN** any of the four team operations is attempted for an event whose status is no longer `draft`
- **THEN** the operation is rejected and no change is made

#### Scenario: Direct team-membership or team-name writes are denied

- **WHEN** a non-admin identity attempts to write `participant.team_id`, `team.name`, or `team.captain_participant_id` directly rather than through the team RPCs
- **THEN** the write is denied

### Requirement: Team membership locks and under-sized teams dissolve when an event goes live

The moment an event's status transitions to `live`, the system SHALL dissolve any team with fewer than two members and reassign its member (if any) to solo play, and no further team-membership or team-name mutation SHALL succeed for that event.

#### Scenario: A single-member team is dissolved at event start

- **WHEN** an event transitions to `live` with a team that has exactly one member
- **THEN** that team is marked dissolved and its member's `team_id` is set to null

#### Scenario: A team with two or more members survives event start

- **WHEN** an event transitions to `live` with a team that has two or more members
- **THEN** that team is not dissolved and its members' `team_id` values are unchanged

#### Scenario: Team mutation is rejected once the event is live

- **WHEN** any of the four team operations is attempted for an event that is now `live`
- **THEN** the operation is rejected

### Requirement: Waiting-screen media is admin-writable, publicly readable, and stripped of identifying metadata

The system SHALL provide a Storage location for an event's optional waiting-screen media (image only — see the `event-authoring` capability for the video-deferral decision). Only an admin identity SHALL be able to upload or replace media in that location. Any uploaded file SHALL have EXIF and other embedded metadata stripped before it is stored. Once stored, the media SHALL be readable without authentication, matching the public-summary posture the `onboarding` capability already gives the rest of an event's non-administrative details.

#### Scenario: Non-admin upload is denied

- **WHEN** a non-admin identity attempts to upload a file to the waiting-screen media location
- **THEN** the upload is denied

#### Scenario: Admin upload succeeds

- **WHEN** an admin identity uploads an image or short video to the waiting-screen media location
- **THEN** the upload succeeds and the file is stored

#### Scenario: Uploaded media has no embedded metadata

- **WHEN** a file carrying EXIF or other embedded metadata is uploaded to the waiting-screen media location
- **THEN** the stored file no longer carries that metadata

#### Scenario: Stored media is readable without authentication

- **WHEN** a request with no session reads a stored waiting-screen media file by its reference
- **THEN** the file is returned

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

### Requirement: The event's current step is kept current in the system of record

As the flow-controller advances an event from one step to the next, the system SHALL keep the event's record of its current step, and that step's activation time, synchronized in Postgres — not only in the real-time layer that drives clients.

#### Scenario: Starting the event records its first step as current

- **WHEN** the flow-controller starts an event
- **THEN** the event's record of its current step identifies the first step, with an activation time

#### Scenario: Advancing records the new step as current

- **WHEN** the flow-controller advances a live event to its next step
- **THEN** the event's record of its current step identifies that next step, with a new activation time

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

### Requirement: An admin can hide or rename any participant or team

The system SHALL provide an admin-only operation to hide/show and/or rename any participant, and a matching operation for any team, each callable regardless of the event's status (unlike event/step/question/team authoring, which is draft-only). A new name provided through either operation SHALL still be checked against the profanity wordlist.

#### Scenario: Admin hides a participant

- **WHEN** an admin marks a participant hidden
- **THEN** the participant's `hidden` flag is set and the change is visible to subsequent reads

#### Scenario: Admin renames a team

- **WHEN** an admin renames a team to an available, non-profane name
- **THEN** the team's name is updated

#### Scenario: A profane rename is rejected

- **WHEN** an admin attempts to rename a participant or team to a name matching the profanity wordlist
- **THEN** the rename is rejected and the existing name is unchanged

#### Scenario: Moderation works on a live event

- **WHEN** an admin hides, shows, or renames a participant or team while the event's status is `live`
- **THEN** the operation succeeds, unlike ordinary event/step/team-authoring writes which are draft-only

#### Scenario: A non-admin cannot moderate

- **WHEN** a non-admin identity attempts either operation
- **THEN** the request is rejected

### Requirement: An anonymous participant's data is purged 90 days after their event ends

The system SHALL remove an anonymous participant's display name, answers, and per-step and final scores once 90 days have passed since the event they took part in ended. This SHALL happen automatically, without requiring any request from the participant or an admin. An account holder's data is never subject to this automatic purge.

#### Scenario: An anonymous participant's data is purged after 90 days

- **WHEN** 90 days have passed since an event with an anonymous participant ended
- **THEN** that participant's display name, answers, and scores are no longer present in the system

#### Scenario: An anonymous participant's data is retained before 90 days have passed

- **WHEN** fewer than 90 days have passed since the event ended (or the event has not yet ended)
- **THEN** that participant's data is still present

#### Scenario: An account holder's data is not affected by this purge

- **WHEN** 90 days have passed since an event with an account-holding participant ended
- **THEN** that participant's data is unaffected by the automatic purge
