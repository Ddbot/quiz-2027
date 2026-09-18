## ADDED Requirements

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
