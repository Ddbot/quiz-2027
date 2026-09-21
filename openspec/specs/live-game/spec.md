# live-game Specification

## Purpose

The player's live-gameplay experience once an event is under way: waiting between steps, answering an active question, and seeing that input lock — everything between "the event has gone live" and "a result is revealed" (reveal itself is a later capability).

## Requirements

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

### Requirement: Once a step is revealed, the player sees their own result

When a player's private result for a step arrives, their client SHALL replace that step's holding view with a view showing whether their answer was correct and how many points they earned, without showing the correct option, other players' answers, or rankings.

#### Scenario: A correct answer shows the points earned

- **WHEN** a player's own result for a step indicates a correct answer
- **THEN** their client shows that the answer was correct along with the points earned

#### Scenario: An incorrect or missing answer shows no points

- **WHEN** a player's own result for a step indicates an incorrect answer, or that they did not submit one
- **THEN** their client shows that no points were earned for that step, without indicating what the correct answer was

### Requirement: A player sees a clear terminal state once the event has ended

Once the event has ended, a still-connected player's client SHALL show a state acknowledging the event is over, rather than leaving the area below their joined confirmation empty.

#### Scenario: A connected player sees the event has ended

- **WHEN** the event a player is connected to transitions to ended
- **THEN** their client shows that the event has ended, without showing the team-lobby or in-round views any longer

### Requirement: A connected player's device blanks while the kill switch is active

A still-connected player's client SHALL show a full blanking overlay whenever the kill switch is active, in place of whatever it would otherwise show, and SHALL resume that view exactly once the kill switch is cleared.

#### Scenario: A player's device blanks when the kill switch activates

- **WHEN** the kill switch becomes active while a player's client is connected
- **THEN** their client shows the blanking overlay instead of the team-lobby, question, or any other view

#### Scenario: A player's device resumes its prior view when the kill switch clears

- **WHEN** the kill switch is cleared after being active
- **THEN** the player's client resumes showing whatever it would otherwise show for the event's current state

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
