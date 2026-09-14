## Purpose

The player-facing identity and consent flow: reaching an event by join code, choosing an anonymous or account identity, the age/legal/marketing consent gate, the permanent-display-name warning, and the idempotent join itself — everything between "a player opens the join link" and "the player has a `participant` row for that event."

## ADDED Requirements

### Requirement: A player reaches an event by join code

The player entry route SHALL accept a join code from the URL (reachable via a QR code or by typing the same code manually) and resolve it to the corresponding event, or present a clear error if the code does not resolve to a joinable event.

#### Scenario: Valid join code resolves to its event

- **WHEN** a player opens the entry route with a join code that matches a joinable event
- **THEN** that event's public details are shown and the player can proceed to choose an identity

#### Scenario: Invalid join code is rejected clearly

- **WHEN** a player opens the entry route with a join code that does not match any joinable event
- **THEN** a clear error is shown and no identity or join step is offered

### Requirement: A player may join anonymously with only a display name

The system SHALL let a player join an event anonymously by providing a display name alone, without creating a persistent account.

#### Scenario: Anonymous join needs no email or password

- **WHEN** a player chooses to join anonymously and provides only a display name
- **THEN** they receive an anonymous authenticated session and are not asked for an email or password

### Requirement: A player may join with an account, verified by email

The system SHALL let a player create an account with email, password, and display name, and SHALL require the email address to be verified before the account is considered confirmed.

#### Scenario: Account creation requires email verification

- **WHEN** a player creates an account with email, password, and display name
- **THEN** the account is not considered confirmed until the player verifies the email address

#### Scenario: A returning account holder can sign back in

- **WHEN** a player with an existing verified account provides their email and password
- **THEN** they are signed in to that same account

### Requirement: The display name is confirmed as permanent before it is saved

Before a display name is persisted, the system SHALL present a distinct warning that the name is permanent for the life of the participant, and SHALL require explicit confirmation before saving it. Once confirmed, the display name SHALL NOT be editable by the player.

#### Scenario: Permanent-name warning requires confirmation

- **WHEN** a player has entered a display name and not yet confirmed it
- **THEN** the system shows a distinct warning that the name is permanent and does not save it until the player explicitly confirms

#### Scenario: Confirmed name cannot be changed by the player

- **WHEN** a player has already confirmed and joined with a display name
- **THEN** the system offers the player no way to change it

### Requirement: Age, Terms/Privacy, and marketing consent are gated at join time

Before either the anonymous or account join path proceeds, the system SHALL require the player to affirmatively check "I am over 16 years old" (collecting no date of birth) and to accept the Terms of Service and Privacy Policy. Marketing-communication consent SHALL be offered as a separate, unticked, optional checkbox, and joining SHALL succeed whether or not it is checked.

#### Scenario: Age and legal acceptance are required to proceed

- **WHEN** a player has not checked both the 16+ affirmation and the Terms/Privacy acceptance
- **THEN** the system does not proceed with anonymous or account join

#### Scenario: Marketing consent is optional and off by default

- **WHEN** a player completes account creation without checking the marketing-consent box
- **THEN** the account is created successfully and no marketing consent is recorded

### Requirement: The display name is filtered for profanity at entry

The system SHALL reject a display name that matches the French/English profanity wordlist and SHALL let the player retry with a different name.

#### Scenario: Profane name is rejected with a retry

- **WHEN** a player submits a display name that matches the profanity wordlist
- **THEN** the join is rejected, the reason is shown, and the player can retry with a different name

### Requirement: Joining an event is idempotent per identity

Joining the same event with the same identity more than once SHALL return the same `participant` rather than creating a duplicate.

#### Scenario: Re-joining returns the existing participant

- **WHEN** a player who has already joined an event repeats the join for the same event with the same identity
- **THEN** the system returns their existing `participant` rather than creating a new one
