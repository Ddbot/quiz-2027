# analytics Specification

## Purpose

The per-event analytics dashboard: a single admin-only view of how an event actually went — participation, engagement, per-question performance, and final standings — computed from the event's own persisted records, without ever surfacing a player's identity beyond their event display name.

## Requirements

### Requirement: An admin can view a per-event analytics dashboard

The system SHALL provide an admin-only, per-event dashboard showing: the participant count, the completion rate, a per-question correct/incorrect breakdown, the average response time, and the final individual and team rankings. No player email address SHALL appear anywhere in the dashboard, at any level.

#### Scenario: An admin views the dashboard for an event

- **WHEN** an admin requests the dashboard for one of their events
- **THEN** they receive the participant count, completion rate, a correct/incorrect breakdown for each question, the average response time, and the final individual and team rankings

#### Scenario: A non-admin cannot view the dashboard

- **WHEN** a non-admin identity requests the dashboard for an event
- **THEN** the request is rejected

#### Scenario: No email address ever appears

- **WHEN** the dashboard is generated for an event with both anonymous and account-holding participants
- **THEN** no participant's email address appears in any part of the response

### Requirement: Completion rate reflects only the steps a participant was present for

The system SHALL define completion rate as the total number of answers submitted across all participants, divided by the total number of already-revealed steps each participant was present for — counting a participant present from whichever step was current when they joined, onward — summed across every participant rather than averaged per participant.

#### Scenario: A participant present from the start is counted against every revealed step

- **WHEN** completion rate is computed for an event where a participant joined before it started
- **THEN** that participant contributes to the denominator once for every step that has been revealed so far

#### Scenario: A late joiner is not penalized for steps that happened before they arrived

- **WHEN** completion rate is computed for an event where a participant joined only after some steps had already been revealed
- **THEN** that participant contributes to the denominator only for the steps revealed from their join step onward, not the ones before it

#### Scenario: An event with no revealed steps yet has a defined completion rate

- **WHEN** completion rate is computed for an event where no step has been revealed yet
- **THEN** the result is zero, not an error
