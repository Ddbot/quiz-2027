## ADDED Requirements

### Requirement: The leaderboard and podium views show both individual and team standings

The screen's leaderboard and podium views SHALL render both the cumulative individual rankings and the cumulative team rankings, not individuals alone.

#### Scenario: The leaderboard view shows team standings alongside individual ones

- **WHEN** the screen renders the leaderboard view and the event has any teams
- **THEN** both the individual rankings and the team rankings are shown

#### Scenario: The podium view shows team standings alongside individual ones

- **WHEN** the screen renders the podium view and the event has any teams
- **THEN** both the top individual standings and the top team standings are shown
