## ADDED Requirements

### Requirement: The flow-controller can reveal a step's result

The system SHALL accept `mc:reveal` only from the connection currently holding flow control, and only for a step that is already `locked`. On success, the system SHALL run the scoring module against that step's accepted answers, persist the results, and transition the step to `revealed`.

#### Scenario: The flow-controller reveals a locked step

- **WHEN** the connection holding flow control sends `mc:reveal` for a step that is `locked`
- **THEN** the step's results are computed and the step transitions to `revealed`

#### Scenario: A non-controller cannot reveal a step

- **WHEN** a connection that does not hold flow control sends `mc:reveal`
- **THEN** the command is rejected and the step's status is unchanged

#### Scenario: Revealing a step that is not locked is rejected

- **WHEN** the flow-controller sends `mc:reveal` for a step that is still `active` or has no current step at all
- **THEN** the command is rejected and no results are computed

#### Scenario: A repeated reveal does not recompute results

- **WHEN** `mc:reveal` is received again for a step that is already `revealed`
- **THEN** no additional computation or broadcast occurs

### Requirement: Revealed results are broadcast without the answer key, and each player privately learns their own result

Once a step is revealed, the system SHALL broadcast every connection the step's per-participant and per-team results (correctness and points; team average, winner status, and award) without indicating which option was correct, SHALL broadcast the event's cumulative individual and team rankings, and SHALL separately send each player a private message describing only their own outcome for that step.

#### Scenario: Connected clients receive the step's results and current rankings

- **WHEN** a step is revealed
- **THEN** every connected client receives that step's per-participant and per-team results and the event's current cumulative rankings

#### Scenario: The broadcast results never reveal which option was correct

- **WHEN** the step results broadcast is inspected by any connection
- **THEN** it does not indicate which answer option was correct

#### Scenario: A player receives their own result privately

- **WHEN** a step is revealed
- **THEN** each player receives a private message with only their own correctness and points for that step

### Requirement: Reveal persists results to Postgres with retry, never relying on Durable Object memory alone

On reveal, the system SHALL write the step's answers (with computed correctness and points) and step results to the Postgres system of record, retrying with backoff on a transient failure without blocking the live flow for other connections.

#### Scenario: A transient Postgres failure during flush is retried

- **WHEN** the Postgres write during a reveal fails transiently
- **THEN** the system retries with backoff and the flush eventually succeeds, without the live event flow stalling for connected clients
