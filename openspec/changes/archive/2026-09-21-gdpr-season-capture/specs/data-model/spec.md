## ADDED Requirements

### Requirement: An anonymous participant's data is purged 90 days after their event ends

The system SHALL remove an anonymous participant's display name, answers, and per-step and final scores once 90 days have passed since the event they took part in ended. This SHALL happen automatically, without requiring any request from the participant or an admin. An account holder's data is never subject to this automatic purge.

#### Scenario: An anonymous participant's data is purged after 90 days

- **WHEN** 90 days have passed since an event with an anonymous participant ended
- **THEN** that participant's display name, answers, and scores are no longer present in the system

#### Scenario: An anonymous participant's data is retained before 90 days have passed

- **WHEN** fewer than 90 days have passed since the event ended (or the event has not yet ended)
- **THEN** that participant's data is still present

#### Scenario: An account holder's data is not affected by this purge

- **WHEN** 90 days have passed since an event with an account-holding participant ended
- **THEN** that participant's data is unaffected by the automatic purge
