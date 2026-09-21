# team-lobby Specification

## Purpose

The player-facing team formation flow: after a player has joined an event, letting them create a team, join or switch to any open team, leave to play solo, or (as captain) rename their team — everything between "the player has a `participant` row" and "the event starts and team membership locks."

## Requirements

### Requirement: A player is offered team formation while the event is a draft

After joining an event whose status is still `draft`, the player SHALL be offered the choice to create a team, join an existing team, or remain solo. Once the event's status is no longer `draft`, this choice SHALL NOT be offered.

#### Scenario: Team formation is offered for a draft event

- **WHEN** a player has just joined an event whose status is `draft`
- **THEN** the player is shown the team-formation options (create, join, or stay solo)

#### Scenario: Team formation is not offered once the event has started

- **WHEN** a player joins (or is already viewing) an event whose status is no longer `draft`
- **THEN** the player is not shown team-formation options

### Requirement: A player can create a team and becomes its captain

The player SHALL be able to create a team by entering a name; on success, the player becomes that team's captain and its first member.

#### Scenario: Creating a team succeeds with an available name

- **WHEN** a player submits a new team name that is not already taken and not profane
- **THEN** the team is created, the player is shown as its captain and member

#### Scenario: A taken team name is rejected with a retry

- **WHEN** a player submits a team name already used by another team in the event
- **THEN** the player sees a clear "name already taken" message and can retry with a different name

#### Scenario: A profane team name is rejected with a retry

- **WHEN** a player submits a team name matching the profanity wordlist
- **THEN** the player sees a clear rejection message and can retry with a different name

### Requirement: A player can join or switch to any open team

The player SHALL be able to browse the event's non-dissolved teams and join any of them, with no size limit and no approval step. Joining a different team while already on one SHALL move the player directly, without a separate leave step.

#### Scenario: Joining an existing team succeeds

- **WHEN** a player selects an existing team from the list and joins it
- **THEN** the player becomes a member of that team

#### Scenario: Switching teams moves the player directly

- **WHEN** a player who is already on a team selects a different team to join
- **THEN** the player is shown as a member of the new team only

### Requirement: A player can leave their team to play solo

The player SHALL be able to leave their current team at any time before the event starts, returning to solo play.

#### Scenario: Leaving a team returns to solo play

- **WHEN** a player who is on a team chooses to leave it
- **THEN** the player is shown as solo (no team) and can create or join a team again

### Requirement: A team captain can rename their team

The captain of a team SHALL be able to change its name; other members SHALL NOT see a rename control.

#### Scenario: The captain renames the team

- **WHEN** the team's captain submits a new, available, non-profane name
- **THEN** the team's name updates for every viewer

#### Scenario: A non-captain member has no rename control

- **WHEN** a non-captain member of a team views the team lobby
- **THEN** no control to rename the team is offered to them

### Requirement: Team names are checked for profanity client-side before submitting

The client SHALL check a candidate team name against the profanity wordlist, both when creating a team and when renaming one, before submitting to the server — instant feedback layered in front of the existing, unchanged server-side check, which remains authoritative.

#### Scenario: The client flags a profane team name before creating

- **WHEN** a player types a team name matching the profanity wordlist into the create-team form, before submitting
- **THEN** the client shows the rejection reason without waiting for a server round trip

#### Scenario: The client flags a profane team name before renaming

- **WHEN** a captain types a team name matching the profanity wordlist into the rename form, before submitting
- **THEN** the client shows the rejection reason without waiting for a server round trip

#### Scenario: A name that bypasses the client check is still rejected by the server

- **WHEN** a create-team or rename-team request reaches the server with a name matching the profanity wordlist, regardless of what the client-side check did or did not flag
- **THEN** the server rejects the request with the profanity reason
