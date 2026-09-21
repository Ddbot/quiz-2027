## Purpose

Lets an account holder exercise their own basic data rights — see everything the system holds about them, and have their account and personal information removed — without needing to ask an admin.

## ADDED Requirements

### Requirement: An account holder can export their own data

The system SHALL let any authenticated identity retrieve their own profile, every participant record they hold across every event, and every answer they submitted — and no other identity's data.

#### Scenario: An account holder exports their data

- **WHEN** an authenticated identity requests their own data export
- **THEN** they receive their profile, their participant records, and their submitted answers

#### Scenario: The export never includes another identity's data

- **WHEN** an account holder who has played alongside other participants requests their export
- **THEN** the response contains only their own records, never another participant's

### Requirement: An account holder can delete their account

The system SHALL let any authenticated identity delete their account: their profile's identifying fields are purged and the profile is marked deleted, and the display name on every participant record they hold is replaced with a neutral placeholder — while their historical scores remain in the system, no longer attributable to any identifying information.

#### Scenario: Deleting an account purges identifying profile fields

- **WHEN** an authenticated identity deletes their account
- **THEN** their profile's identifying fields are cleared and the profile is marked deleted

#### Scenario: Deleting an account anonymises but keeps score history

- **WHEN** an authenticated identity who has final scores recorded deletes their account
- **THEN** their participant records' display names become a neutral placeholder, and their score rows remain present and unchanged

### Requirement: The console offers a way to reach account export and deletion

The player-facing app SHALL offer a signed-in account holder a reachable page to export their data or delete their account, each requiring explicit confirmation before deletion proceeds.

#### Scenario: A signed-in account holder can reach the account page

- **WHEN** a signed-in account holder is on the app's entry page
- **THEN** they can navigate to a page offering data export and account deletion

#### Scenario: Deleting an account requires confirmation

- **WHEN** an account holder uses the account page's delete control
- **THEN** the app asks for confirmation before the deletion is actually requested
