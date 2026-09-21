## ADDED Requirements

### Requirement: A returning player's reload rejoins their current step directly

A player whose device already holds a valid session and an existing `participant` record for an event SHALL, on reload, be taken directly to their current step, without being shown the identity, consent, or name-confirmation steps again.

#### Scenario: Reloading after joining skips identity and consent

- **WHEN** a player who has already joined an event reloads the page
- **THEN** they see their current step directly, not the identity or consent forms

#### Scenario: A device with no existing session still sees the normal join flow

- **WHEN** a device with no session, or a session with no participant record for this event, opens the page
- **THEN** the identity and consent flow is shown as usual

### Requirement: A player sees when their connection is not currently open

While a player is connected to a live event, the client SHALL show a visible, unobtrusive indication whenever the connection is not open (for example, while automatically reconnecting after a drop), rather than leaving the screen indistinguishable from a normal, connected state.

#### Scenario: A dropped connection is visible to the player

- **WHEN** a player's connection to the event closes and the client begins reconnecting
- **THEN** the player sees an indication that their connection is not currently open

#### Scenario: A healthy connection shows no such indication

- **WHEN** a player's connection is open
- **THEN** no reconnecting indication is shown

### Requirement: A reconnecting player sees the step's current lock state and cannot double-submit

A player who disconnects after submitting an answer and later reconnects SHALL see the step's current state accurately (including if it has since been locked or revealed while they were away), and a repeated submission attempt after reconnecting SHALL still be rejected as already answered.

#### Scenario: Reconnecting after the step was locked while away shows it as locked

- **WHEN** a player who already answered disconnects, the step is locked while they are away, and they reconnect
- **THEN** their client shows the step as locked, not as still accepting answers

#### Scenario: A repeated submission after reconnecting is still rejected

- **WHEN** a player who already answered reconnects and attempts to submit an answer again for the same step
- **THEN** the submission is rejected as already answered
