## REMOVED Requirements

### Requirement: At most one event is live at a time

**Reason**: This was a deliberate v1 simplification (REQUIREMENTS.md §16, SPEC.md FR-028), not a permanent constraint — every event-bound table already carries its own event ID specifically so this limit could be lifted without a data migration. The owner now runs multiple simultaneous company events on some nights.

**Migration**: No data migration required. The `event_one_live_idx` partial unique index is dropped; no other requirement or code path depended on global exclusivity (every real-time room, admin route, and status-change trigger is already scoped to a specific event's own id).

## ADDED Requirements

### Requirement: Multiple events may be live concurrently

The system SHALL allow any number of events to be in `live` status at the same time. There is no system-wide cap on concurrently live events.

#### Scenario: A second live event is accepted while another is already live

- **WHEN** an event is already `live` and a write attempts to set a second, different event's status to `live`
- **THEN** the write succeeds and both events are `live` simultaneously
