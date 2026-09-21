# mc-console Specification

## Purpose

The admin's flow-control UI for running a live event — claiming control and driving the commands that exist so far. Grows incrementally as later milestones add more flow-control commands.

## Requirements

### Requirement: An admin can claim flow control and drive the commands that exist so far from one console

The system SHALL provide an admin-only console for a given event that lets the signed-in admin claim flow control and, once held, invoke starting the event, advancing to the next step, locking the current step, and revealing the current step's results.

#### Scenario: An admin claims control and starts the event

- **WHEN** an admin on the console claims flow control and the event is still a draft with at least one step
- **THEN** the console offers starting the event, and doing so transitions it to live

#### Scenario: The console reflects who currently holds control

- **WHEN** another admin already holds flow control
- **THEN** the console shows that control is held elsewhere before this admin claims it

### Requirement: The console reflects the live event's current state

The console SHALL show the event's current status, the active step (if any) and its lifecycle status, and SHALL update immediately as the flow-controller's actions or the timer change that state.

#### Scenario: The console reflects a step becoming active

- **WHEN** the flow-controller starts the event or advances to a step
- **THEN** the console shows that step as the current active step without requiring a manual refresh

### Requirement: The console lets the flow-controller show the leaderboard and end the event

The console SHALL offer a control that shows the cumulative leaderboard and a control that ends the event, available once the caller holds flow control over a live event. Ending the event SHALL require an explicit confirmation before the command is sent, since it is irreversible.

#### Scenario: Showing the leaderboard from the console

- **WHEN** the flow-controller uses the console's leaderboard control
- **THEN** the leaderboard is shown on every connected screen

#### Scenario: Ending the event requires confirmation

- **WHEN** the flow-controller uses the console's end-event control
- **THEN** the console asks for confirmation before the event is actually ended

### Requirement: The console lets an admin moderate participants and teams

The console SHALL offer a roster of the event's participants and teams with, per row, a control to hide/show it and a control to rename it, available both before and during the event.

#### Scenario: Hiding a participant from the console

- **WHEN** an admin uses the console's hide control on a participant
- **THEN** that participant becomes hidden

#### Scenario: Renaming a team from the console

- **WHEN** an admin uses the console's rename control on a team, providing an available, non-profane name
- **THEN** the team's name updates

#### Scenario: Moderation is available before the event starts

- **WHEN** an admin opens the console's moderation section for a `draft` event
- **THEN** the hide/show and rename controls are available, not only once the event is `live`

### Requirement: Any admin can trigger the kill switch from the console

The console SHALL offer a control that broadcasts the kill switch's blank/freeze directive, and lets the same admin clear it.

#### Scenario: Activating the kill switch from the console

- **WHEN** an admin uses the console's kill-switch control
- **THEN** every connected screen and player device is blanked

#### Scenario: Clearing the kill switch from the console

- **WHEN** an admin uses the console's kill-switch control to clear it, after having activated it
- **THEN** every connection resumes showing its current view
