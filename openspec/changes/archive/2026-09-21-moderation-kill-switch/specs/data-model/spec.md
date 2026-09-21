## ADDED Requirements

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
