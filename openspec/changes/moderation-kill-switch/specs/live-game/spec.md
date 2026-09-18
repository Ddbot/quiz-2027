## ADDED Requirements

### Requirement: A connected player's device blanks while the kill switch is active

A still-connected player's client SHALL show a full blanking overlay whenever the kill switch is active, in place of whatever it would otherwise show, and SHALL resume that view exactly once the kill switch is cleared.

#### Scenario: A player's device blanks when the kill switch activates

- **WHEN** the kill switch becomes active while a player's client is connected
- **THEN** their client shows the blanking overlay instead of the team-lobby, question, or any other view

#### Scenario: A player's device resumes its prior view when the kill switch clears

- **WHEN** the kill switch is cleared after being active
- **THEN** the player's client resumes showing whatever it would otherwise show for the event's current state
