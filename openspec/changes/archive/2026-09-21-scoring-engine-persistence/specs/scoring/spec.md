## Purpose

The framework-agnostic rules for turning accepted answers into points and rankings — per-step individual and team scoring, tie handling, eligibility, and cumulative totals — independent of any transport or storage mechanism.

## ADDED Requirements

### Requirement: A step's individual scores follow untimed/timed rules

For an untimed step, the system SHALL award the step's configured points to every participant whose answer matches the correct option, with no advantage for answering sooner. For a timed step, the system SHALL award those points only to the participant with the earliest correct answer, ranked by (server receipt time, receipt sequence); every other participant SHALL score 0 for that step. Where two or more correct answers on a timed step share an identical server receipt time at millisecond precision, the system SHALL treat them as tied and award each the full points.

#### Scenario: An untimed step awards every correct answer

- **WHEN** a step is untimed and three participants answer correctly and one incorrectly
- **THEN** all three correct participants receive the step's full points and the incorrect participant receives 0

#### Scenario: A timed step awards only the fastest correct answer

- **WHEN** a step is timed and multiple participants answer correctly at different times
- **THEN** only the participant with the earliest (receipt time, receipt sequence) receives the step's points; every other participant receives 0

#### Scenario: Identical receipt timestamps on a timed step tie

- **WHEN** two correct answers on a timed step share the same server receipt time at millisecond precision
- **THEN** both receive the step's full points

### Requirement: A team's step score is the mean of its submitting members, with tied winners sharing the award

The system SHALL compute a team's per-step score as the arithmetic mean of the per-step points of only those team members who submitted an answer for that step. The team(s) with the highest per-step mean SHALL be identified as the step's winner(s) and each SHALL receive the step's full team award; two or more teams tied for the highest mean SHALL each receive the full award. A team with no submitting member SHALL be excluded from the step's team ranking and SHALL be recorded with a 0 award.

#### Scenario: A team's score is the mean of submitting members only

- **WHEN** a team has three members and only two submitted answers for a step
- **THEN** the team's step score is the mean of those two members' points, not all three

#### Scenario: Tied teams each receive the full step award

- **WHEN** two or more teams share the highest per-step mean
- **THEN** each of them receives the step's full team award

#### Scenario: A team with no submitting member is excluded and recorded as 0

- **WHEN** no member of a team submitted an answer for a step
- **THEN** that team is excluded from the step's ranking and its award for that step is recorded as 0

### Requirement: A step with no answers scores everyone zero

Where no participant answers a step, the system SHALL record 0 points for every participant and a 0 team award for every team for that step.

#### Scenario: A step nobody answers scores everyone zero

- **WHEN** a step's answer window closes with no answers submitted
- **THEN** every participant's score and every team's award for that step is 0

### Requirement: Cumulative rankings sum every step's results so far

The system SHALL maintain a cumulative individual ranking as the running sum of each participant's per-step points across every step of the event scored so far, and a cumulative team ranking as the running sum of each team's per-step awards across those same steps.

#### Scenario: Cumulative individual ranking sums every scored step

- **WHEN** an event has had two steps scored and a participant scored points on both
- **THEN** that participant's cumulative ranking is the sum of their points from both steps

#### Scenario: Cumulative team ranking sums every scored step's awards

- **WHEN** an event has had two steps scored and a team won the award on one of them
- **THEN** that team's cumulative ranking is the sum of its awards from both steps

### Requirement: A participant scores only from the step active when they joined onward

A participant who joins an event after it has started SHALL begin at 0 points and SHALL be eligible to score starting from the step that was active at the moment they joined; the system SHALL NOT award them points for any step that had already started before they joined, even if their answer for it would otherwise be accepted.

#### Scenario: A late joiner is ineligible for steps before they joined

- **WHEN** a participant joins while a step other than the event's first step is active
- **THEN** that participant is not eligible to score on any step that started before they joined

#### Scenario: A late joiner is eligible from their joining step onward

- **WHEN** a participant joins while a given step is active and later answers that step or a later one correctly
- **THEN** they are scored normally for that step and every step after it
