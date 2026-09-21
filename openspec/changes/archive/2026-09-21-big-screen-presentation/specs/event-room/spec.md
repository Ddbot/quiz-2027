## ADDED Requirements

### Requirement: A connection can authenticate as the screen role

The system SHALL assign the `screen` role to a connection that presents a valid admin identity together with a screen-connection flag, instead of the `admin` role it would otherwise receive. A screen connection SHALL be render-only: it SHALL NOT be permitted to invoke any command reserved for the flow-controller or for admins generally.

#### Scenario: An admin connection requesting the screen role receives it

- **WHEN** a connection presenting a valid admin identity also presents the screen-connection flag
- **THEN** the connection's role is `screen`, not `admin`

#### Scenario: A screen connection cannot invoke admin-only commands

- **WHEN** a connection with the `screen` role sends a command reserved for an admin (such as `operator:display` or a flow-control command)
- **THEN** the command is rejected

### Requirement: Any admin can set the big-screen display directive

The system SHALL accept `operator:display` from any admin connection (not gated to the flow-control lock), setting which view every `screen` connection should currently render. The value SHALL be one of: waiting, question, collecting, results, leaderboard, podium, or blank.

#### Scenario: An admin sets the display directive

- **WHEN** an admin connection sends `operator:display` with a valid view
- **THEN** the authoritative state's display value changes accordingly and every connection is notified

#### Scenario: An admin without flow control can still set the display directive

- **WHEN** an admin who does not currently hold the flow-control lock sends `operator:display`
- **THEN** the command still succeeds

#### Scenario: An invalid display value is rejected

- **WHEN** `operator:display` is sent with a value that is not one of the recognized views
- **THEN** the command is rejected and the display value is unchanged

### Requirement: A reconnecting client receives the current step's results and rankings, not a replay of missed ones

The system SHALL retain the most recently broadcast step results and the most recently broadcast rankings, and SHALL resend both to any connection on connect or reconnect, alongside the authoritative state snapshot. The retained step results SHALL be cleared whenever a new step becomes active, so a reconnecting client never sees a prior step's results attributed to the current one; the retained rankings SHALL persist across step transitions, since a cumulative total is never stale, only superseded by a later one.

#### Scenario: A reconnecting client sees the current step's results

- **WHEN** a client connects or reconnects after the current step has been revealed
- **THEN** it receives that step's results and the current rankings alongside its state snapshot

#### Scenario: A reconnecting client does not see a previous step's results after advancing

- **WHEN** a client connects or reconnects after a new step has become active, following an earlier step's reveal
- **THEN** it does not receive the earlier step's results

#### Scenario: A reconnecting client sees current rankings even before the current step is revealed

- **WHEN** a client connects or reconnects while a new step is active but not yet revealed, after an earlier step already contributed to the rankings
- **THEN** it still receives the rankings as they stood after the most recent reveal
