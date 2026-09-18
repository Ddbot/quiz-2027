## ADDED Requirements

### Requirement: A player sees a clear terminal state once the event has ended

Once the event has ended, a still-connected player's client SHALL show a state acknowledging the event is over, rather than leaving the area below their joined confirmation empty.

#### Scenario: A connected player sees the event has ended

- **WHEN** the event a player is connected to transitions to ended
- **THEN** their client shows that the event has ended, without showing the team-lobby or in-round views any longer
