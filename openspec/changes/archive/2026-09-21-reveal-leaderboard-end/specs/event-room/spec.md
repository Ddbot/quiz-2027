## ADDED Requirements

### Requirement: The flow-controller can show the cumulative leaderboard on demand

The system SHALL accept `mc:show_leaderboard` only from the connection currently holding flow control, and only while the event is `live`. On success it SHALL recompute the event's cumulative individual and team rankings, set the display directive to the leaderboard view, and broadcast both to every connection.

#### Scenario: The flow-controller shows the leaderboard

- **WHEN** the flow-controller sends `mc:show_leaderboard` for a live event
- **THEN** every connection receives the current cumulative rankings and the display directive changes to the leaderboard view

#### Scenario: A non-controller cannot show the leaderboard

- **WHEN** a connection that does not hold flow control sends `mc:show_leaderboard`
- **THEN** the command is rejected and the display directive is unchanged

### Requirement: The flow-controller can end the event, finalising its rankings

The system SHALL accept `mc:end` only from the connection currently holding flow control, and only while the event is `live`. On success it SHALL compute and persist final individual and team rankings, transition the event to permanently ended, and make those final rankings available to every connection.

#### Scenario: The flow-controller ends the event

- **WHEN** the flow-controller sends `mc:end` for a live event
- **THEN** the event transitions to ended and its final individual and team rankings are persisted

#### Scenario: Ending an event that is not live is rejected

- **WHEN** `mc:end` is sent for an event that is still a draft, or already ended
- **THEN** the command is rejected and no finalisation occurs

#### Scenario: A non-controller cannot end the event

- **WHEN** a connection that does not hold flow control sends `mc:end`
- **THEN** the command is rejected

### Requirement: Once an event has ended, its game-progress commands are permanently rejected

Once an event has ended, the system SHALL reject any attempt to lock a step, reveal a step's results, or submit an answer — including one already scheduled to occur automatically (such as a pending timer-expiry lock) — while continuing to allow the display directive to be changed and flow control to be claimed, so the event's outcome can still be presented.

#### Scenario: Locking a step is rejected after the event has ended

- **WHEN** `mc:lock` is sent for an event that has already ended
- **THEN** the command is rejected and no step transition occurs

#### Scenario: Revealing a step is rejected after the event has ended

- **WHEN** `mc:reveal` is sent for an event that has already ended
- **THEN** the command is rejected and no results are computed

#### Scenario: Submitting an answer is rejected after the event has ended

- **WHEN** `answer:submit` is sent for an event that has already ended
- **THEN** the submission is rejected

#### Scenario: The display directive can still be changed after the event has ended

- **WHEN** `operator:display` is sent for an event that has already ended
- **THEN** the display directive still changes, so the final podium can still be shown
