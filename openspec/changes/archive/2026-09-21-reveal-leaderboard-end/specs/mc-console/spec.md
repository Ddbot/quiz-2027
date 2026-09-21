## ADDED Requirements

### Requirement: The console lets the flow-controller show the leaderboard and end the event

The console SHALL offer a control that shows the cumulative leaderboard and a control that ends the event, available once the caller holds flow control over a live event. Ending the event SHALL require an explicit confirmation before the command is sent, since it is irreversible.

#### Scenario: Showing the leaderboard from the console

- **WHEN** the flow-controller uses the console's leaderboard control
- **THEN** the leaderboard is shown on every connected screen

#### Scenario: Ending the event requires confirmation

- **WHEN** the flow-controller uses the console's end-event control
- **THEN** the console asks for confirmation before the event is actually ended
