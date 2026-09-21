## MODIFIED Requirements

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

## ADDED Requirements

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
