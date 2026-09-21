## Purpose

The admin's flow-control UI for running a live event — claiming control and driving the commands that exist so far. Grows incrementally as later milestones add more flow-control commands.

## ADDED Requirements

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
