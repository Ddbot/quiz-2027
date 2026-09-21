## Purpose

The venue-facing big-screen surface: a render-only receiver the Operator casts to a secondary display, showing exactly the view the Operator selects, high-contrast and free of player-entered content unless that view explicitly includes it.

## ADDED Requirements

### Requirement: The screen receiver connects as the screen role and renders only the Operator-selected view

The `/screen/:eventId` page SHALL connect to the event as the `screen` role and SHALL render the view currently directed by the Operator, reconciling immediately whenever that directive changes.

#### Scenario: The screen renders the view the Operator selected

- **WHEN** the Operator sets the display directive to a given view
- **THEN** the screen receiver renders that view within the same propagation budget as any other state change

### Requirement: The big-screen view is visually distinct and high-contrast

The screen receiver's rendering SHALL be visually distinct from the player view and SHALL use a high-contrast palette suitable for large-format, low-light venue viewing.

#### Scenario: The screen view is not a player view

- **WHEN** the screen receiver renders any of its views
- **THEN** its layout and styling are distinct from the player app's own views, not a reused copy

### Requirement: The screen offers at least the seven required views

The system SHALL let the Operator choose among at least: waiting, question, collecting answers, step results, cumulative leaderboard, final podium standings, and blank.

#### Scenario: Every required view is reachable

- **WHEN** the Operator selects each of the seven required views in turn
- **THEN** the screen renders a distinct view for each one

### Requirement: Only the results and leaderboard views show player-entered content

The screen SHALL NOT render any participant display name or team name in the waiting, question, collecting, podium, or blank views. The results and leaderboard views SHALL be the only ones that render participant and team names.

#### Scenario: The waiting view shows no player-entered content

- **WHEN** the screen renders the waiting view
- **THEN** no participant or team name appears anywhere on it

#### Scenario: The results view may show participant and team names

- **WHEN** the screen renders the results view
- **THEN** it may render participant and team names as part of that step's outcome

### Requirement: The waiting view shows the event's configured media, never the correct answer or player content

While directed to the waiting view, the screen SHALL show the event's configured waiting-screen image (if any) and countdown target (if any); it SHALL NOT show any player-entered content.

#### Scenario: The waiting view shows the configured image

- **WHEN** the event has a waiting-screen image configured and the screen is directed to the waiting view
- **THEN** that image is shown

### Requirement: The question and results views never reveal the correct option before it is due

The question and collecting views SHALL show only the question text and its options, never which one is correct. The results view SHALL show each participant's and team's outcome without indicating which option was correct.

#### Scenario: The question view never reveals the answer key

- **WHEN** the screen renders the question or collecting view
- **THEN** nothing on it indicates which option is correct

### Requirement: The screen reflects current state on reconnect, not a replay

On reconnecting, the screen SHALL render the view matching the current authoritative state and, where applicable, the current step results and rankings — not a sequence of intermediate views it missed while disconnected.

#### Scenario: A reconnecting screen shows current state directly

- **WHEN** the screen reconnects after missing one or more display changes
- **THEN** it renders only the current view, without transitioning through the ones it missed

### Requirement: The Operator can cast the screen to a secondary display

From a Chrome/Edge desktop browser, the Operator SHALL be able to initiate a session that opens the screen receiver on one or more secondary displays, all showing identical content.

#### Scenario: The Operator casts to a secondary display

- **WHEN** the Operator initiates casting from a supporting browser
- **THEN** the screen receiver opens on the target display and reflects the same state as every other connected screen
