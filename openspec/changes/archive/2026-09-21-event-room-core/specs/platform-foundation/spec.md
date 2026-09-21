## MODIFIED Requirements

### Requirement: One real-time object per event with a connect-and-echo contract

The real-time worker SHALL route every connection for a given event identifier to a single stateful object dedicated to that event. The object authenticates each connection and holds real event state (see the `event-room` capability) rather than echoing; it SHALL NOT accept a connection whose token fails JWT verification.

#### Scenario: Connection is accepted and echoes

- **WHEN** a client with a valid Supabase JWT opens a WebSocket to the worker for event identifier `E`
- **THEN** the connection is accepted and assigned a role, and no longer merely echoes messages (see the `event-room` capability for the full connection and state contract)

#### Scenario: Same event identifier shares one object

- **WHEN** two clients connect for the same event identifier `E`
- **THEN** both connections are served by the same stateful object instance
