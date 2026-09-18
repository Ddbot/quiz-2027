## MODIFIED Requirements

### Requirement: The display name is filtered for profanity at entry

The system SHALL reject a display name that matches the French/English profanity wordlist and SHALL let the player retry with a different name. The client SHALL also check the candidate name against the same wordlist before submitting, so a match is flagged instantly instead of only after a round trip — this client-side check is a UX improvement layered in front of the server check, which remains authoritative and SHALL still reject a match the client-side check missed or that was bypassed.

#### Scenario: Profane name is rejected with a retry

- **WHEN** a player submits a display name that matches the profanity wordlist
- **THEN** the join is rejected, the reason is shown, and the player can retry with a different name

#### Scenario: The client flags a profane name before submitting

- **WHEN** a player types a display name that matches the profanity wordlist, before submitting the join form
- **THEN** the client shows the same rejection reason without waiting for a server round trip

#### Scenario: A name that bypasses the client check is still rejected by the server

- **WHEN** a join request reaches the server with a display name matching the profanity wordlist, regardless of what the client-side check did or did not flag
- **THEN** the server rejects the join with the profanity reason
