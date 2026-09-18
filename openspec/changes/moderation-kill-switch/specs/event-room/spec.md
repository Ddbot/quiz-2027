## ADDED Requirements

### Requirement: Any admin can trigger the kill switch, blanking every connection

The system SHALL accept `mc:kill_switch` from any admin connection (not flow-controller-gated, like `mc:claim_control` and `operator:display`), regardless of the event's status. On success it SHALL broadcast a blank/freeze directive to every connection — screens and players alike — independently of the current `display`/step state, and a matching command SHALL clear it, restoring exactly what was showing underneath with no residue.

#### Scenario: An admin activates the kill switch

- **WHEN** any admin sends `mc:kill_switch` with `{ on: true }`
- **THEN** every connected screen and player device receives the blank/freeze directive

#### Scenario: An admin clears the kill switch

- **WHEN** any admin sends `mc:kill_switch` with `{ on: false }` after it was active
- **THEN** every connection stops showing the blank/freeze directive and resumes showing whatever the current `display`/step state indicates, unchanged since before the kill switch was activated

#### Scenario: A non-admin cannot trigger the kill switch

- **WHEN** a non-admin connection sends `mc:kill_switch`
- **THEN** the command is rejected and no directive is broadcast

### Requirement: Answer submission is rejected while the kill switch is active

Once the kill switch is active, the system SHALL reject `answer:submit`, in addition to blanking the submitting player's own view.

#### Scenario: An answer is rejected while the kill switch is active

- **WHEN** a player sends `answer:submit` while the kill switch is active
- **THEN** the submission is rejected

### Requirement: Hidden participants and hidden teams are excluded from cumulative rankings and step-results broadcasts

The `rankings` and `step_results` messages — which feed the big-screen leaderboard, podium, and results views — SHALL exclude any participant or team currently marked hidden, without renumbering the rank of the entities that remain. Their answers and scores SHALL continue to be computed, persisted, and counted exactly as for any other participant or team, including toward a team's total when a hidden individual is one of its scoring members.

#### Scenario: A hidden participant does not appear in the broadcast rankings

- **WHEN** cumulative rankings are recomputed and broadcast (`mc:reveal` or `mc:show_leaderboard`) for an event with a hidden participant
- **THEN** that participant does not appear in the `rankings` message's individual standings, and the remaining participants keep the ranks they would have had including the hidden one

#### Scenario: A hidden team does not appear in the broadcast rankings

- **WHEN** cumulative rankings are recomputed and broadcast for an event with a hidden team
- **THEN** that team does not appear in the `rankings` message's team standings

#### Scenario: A hidden participant's answers and scores are still recorded and counted

- **WHEN** a hidden participant answers a step, including one who is a member of a non-hidden team
- **THEN** their answer and per-step result are persisted exactly as for any other participant, and their points still count toward their team's total

#### Scenario: A hidden participant does not appear in the broadcast step results

- **WHEN** a step is revealed for an event with a hidden participant
- **THEN** that participant does not appear in the `step_results` message's participant list
