# event-authoring Specification

## Purpose

The French-only admin console an admin uses to author an event before it goes live: signing in, creating and editing a draft event, building its ordered MCQ steps, generating the join code and QR code, attaching waiting-screen media, and being stopped from editing once the event is no longer a draft.

## Requirements

### Requirement: Only an admin identity can reach the console

The admin console SHALL require sign-in, and every console route SHALL be reachable only to an identity whose `profile.is_admin` is `true`. No route in the console SHALL offer a way to create an account or self-elevate to admin.

#### Scenario: Signed-out visitor is sent to sign-in

- **WHEN** a visitor with no session opens any admin console route
- **THEN** they are presented with sign-in rather than console content

#### Scenario: Non-admin identity is denied console access

- **WHEN** an authenticated identity whose profile is not an admin opens the admin console
- **THEN** the console content is not shown

#### Scenario: Admin identity reaches the console

- **WHEN** an identity whose profile has `is_admin = true` signs in
- **THEN** they reach the console's event list

### Requirement: An admin can author a draft event

The console SHALL let an admin create a new event and read, update, and delete an existing event while its status is `draft`, setting at minimum its title, language, and venue label.

#### Scenario: Admin creates a draft event

- **WHEN** an admin submits the new-event form with a title and a language
- **THEN** a new event is created with status `draft` and appears in the admin's event list

#### Scenario: Admin edits a draft event's details

- **WHEN** an admin changes the title, language, or venue label of an event that is still `draft`
- **THEN** the change is saved and reflected the next time the event is viewed

#### Scenario: Admin deletes a draft event

- **WHEN** an admin deletes an event that is still `draft`
- **THEN** the event and its authored content no longer appear in the admin's event list

### Requirement: An event's language is selectable and applies to player-facing surfaces

The console SHALL let an admin set an event's language to French or English, distinct from the console's own French-only interface.

#### Scenario: Admin sets the event language

- **WHEN** an admin selects French or English for an event
- **THEN** the event is saved with that language, to be applied to that event's player and big-screen surfaces

### Requirement: An admin authors an ordered sequence of MCQ steps

Within a draft event, the console SHALL let an admin add, remove, and reorder steps, where every step is exactly one MCQ game.

#### Scenario: Admin adds a step

- **WHEN** an admin adds a step to a draft event
- **THEN** a new MCQ step is appended to that event's ordered sequence

#### Scenario: Admin reorders steps

- **WHEN** an admin changes the position of a step within a draft event's sequence
- **THEN** the event's steps are saved in the new order

#### Scenario: Admin removes a step

- **WHEN** an admin removes a step from a draft event
- **THEN** that step and its MCQ content no longer appear in the event's sequence

### Requirement: An admin configures each MCQ step's content and scoring

For each step, the console SHALL let an admin set: the question text; the answer options; which option is correct; whether the step is timed and, if so, its countdown duration in seconds; the points awarded for a correct answer (defaulting to 1); and the fixed points awarded to the step's winning team.

#### Scenario: Admin fills in a step's question and options

- **WHEN** an admin enters a question text, at least two answer options, and marks one option correct
- **THEN** the step's MCQ content is saved with that question, those options, and that correct option

#### Scenario: Admin configures the step's timer

- **WHEN** an admin marks a step as timed and sets a countdown duration
- **THEN** the step is saved as timed with that countdown duration

#### Scenario: Admin configures scoring

- **WHEN** an admin sets the points for a correct answer and the winning-team bonus for a step
- **THEN** the step is saved with those point values

### Requirement: Each event has a generated join code and QR code

The console SHALL generate a unique join code for an event and render a corresponding QR code that resolves to the player entry route with that code pre-filled.

#### Scenario: Join code and QR are shown for an event

- **WHEN** an admin views a created event
- **THEN** its join code and a QR code encoding that join code are displayed

#### Scenario: QR code resolves to the player route

- **WHEN** the QR code for an event is decoded
- **THEN** it encodes a URL that opens the player entry route with that event's join code pre-filled

### Requirement: An admin configures the waiting screen

The console SHALL let an admin optionally attach one image and an optional countdown-target date/time to a draft event, for later display on the big screen while players wait for the event to start. Video is out of scope for this capability's first version (see design.md for the reasoning); the upload control SHALL only accept image files.

#### Scenario: Admin attaches waiting-screen media

- **WHEN** an admin uploads an image for a draft event's waiting screen
- **THEN** the event is saved with a reference to that uploaded image

#### Scenario: Non-image upload is rejected

- **WHEN** an admin attempts to upload a non-image file for a draft event's waiting screen
- **THEN** the upload is rejected and no media reference is saved

#### Scenario: Admin sets a countdown target

- **WHEN** an admin sets a countdown-target date/time for a draft event
- **THEN** the event is saved with that target

### Requirement: The console prevents editing an event that is no longer a draft

Once an event's status is no longer `draft`, the console SHALL disable its edit affordances (event details, steps, MCQ content, waiting screen) and, if a write is nonetheless attempted and rejected by the server, SHALL show a clear message rather than a silent failure or a generic error.

#### Scenario: Edit affordances are disabled for a non-draft event

- **WHEN** an admin views an event whose status is no longer `draft`
- **THEN** the console shows its content read-only and does not offer edit controls for it

#### Scenario: A rejected write surfaces a clear message

- **WHEN** a write to a non-draft event's content is attempted and rejected
- **THEN** the admin sees a message explaining that the event can no longer be edited, rather than a silent failure
