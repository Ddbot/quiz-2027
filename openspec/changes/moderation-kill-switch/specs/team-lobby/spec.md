## ADDED Requirements

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
