## Purpose

The player's live-gameplay experience once an event is under way: waiting between steps, answering an active question, and seeing that input lock — everything between "the event has gone live" and "a result is revealed" (reveal itself is a later capability).

## ADDED Requirements

### Requirement: A player's client stays connected to the live event and reflects its current state

Once a player has a `participant` row for an event, their client SHALL maintain a live connection to that event and SHALL render the view matching the connection's current authoritative state, reconciling immediately whenever that state changes.

#### Scenario: The view matches the current state on connect

- **WHEN** a player's client connects (or reconnects)
- **THEN** it renders the waiting, question, or answered view matching the state it received, not a stale view from an earlier connection

### Requirement: Between steps, the player sees a lightweight waiting view with no media

While no step is active, the player's client SHALL show only a countdown and/or a lightweight branding image — never the waiting-screen media configured for the big screen.

#### Scenario: The player sees a lightweight waiting view

- **WHEN** the event is live but no step is currently active
- **THEN** the player's client shows a countdown and/or branding only, not the event's waiting-screen media

### Requirement: A player selects one option and explicitly confirms before it is submitted

Once a step is active, the player's client SHALL let the player select exactly one answer option, and SHALL require a distinct, explicit confirmation action before that selection is sent as their answer. Selecting an option alone SHALL NOT submit anything.

#### Scenario: Selecting an option does not submit it

- **WHEN** a player selects an option on an active step without confirming
- **THEN** no answer has been sent

#### Scenario: Confirming sends the selected answer

- **WHEN** a player selects an option and then presses the explicit confirm control
- **THEN** their answer is sent for that step

### Requirement: Once answered or locked, the player's input is disabled

After a player's answer is accepted, or once the step's answer window closes (explicitly or at timer expiry), the player's client SHALL disable further option selection for that step and SHALL show a holding view, without revealing a result.

#### Scenario: Input disables after answering

- **WHEN** a player's answer for the active step is accepted
- **THEN** their client disables further selection for that step and shows a holding view

#### Scenario: Input disables when the step locks

- **WHEN** a step the player has not answered transitions to locked (explicitly or at expiry)
- **THEN** their client disables selection for that step

### Requirement: The client enforces the answer deadline independently of the server's lock broadcast

Using the server clock reference from its connection, the player's client SHALL compute the step's expiry itself and disable selection at that instant, without waiting for the server's `locked` state to arrive.

#### Scenario: The client locks input at the computed expiry

- **WHEN** the client-computed expiry for a timed, active step is reached
- **THEN** the client disables further selection immediately, even before any server broadcast confirms the lock
