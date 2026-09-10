## Purpose

Defines the deployment topology, environment model, data-residency configuration, and real-time transport skeleton that all Quiz 2027 product capabilities are built on. It is the operational baseline: how the system is hosted, how code reaches production, where data lives, and how a client establishes a real-time connection to an event — before any auth or game behavior exists.

## ADDED Requirements

### Requirement: Repository is a workspace with a platform-independent shared package

The codebase SHALL be a single multi-package workspace containing at least: a web application package, a real-time worker package, and a shared package. The shared package SHALL NOT import from any web framework, any Cloudflare/Workers runtime API, or any hosting-provider SDK, so that game logic added later remains portable to another runtime.

#### Scenario: Shared package has no platform dependencies

- **WHEN** the shared package's dependency graph and source imports are inspected
- **THEN** it references neither React, the Cloudflare Workers runtime, `partyserver`, nor any Supabase/Vercel SDK

#### Scenario: Workspace packages build independently

- **WHEN** a type-check and build is run for the workspace
- **THEN** the web package, the worker package, and the shared package each compile without error

### Requirement: Two environments only

The system SHALL operate with exactly two environments: local development and production. No staging or preview backend SHALL be provisioned. Ephemeral per-pull-request frontend previews are permitted but MUST target production backend services or be disabled.

#### Scenario: No staging backend exists

- **WHEN** the provisioned Supabase projects and Cloudflare Workers environments are listed
- **THEN** there is one Supabase project and one Worker environment, both designated production

### Requirement: Continuous deployment from the default branch

Merging to the default branch SHALL deploy each production surface without manual steps: the web application via the hosting provider's Git integration, and the real-time worker via an automated pipeline. Database schema changes SHALL be applied through a repeatable migration command, not manual edits.

#### Scenario: Web app deploys on merge

- **WHEN** a commit is merged to the default branch that changes the web application
- **THEN** the hosting provider builds and publishes the new version to the production URL with no human action

#### Scenario: Worker deploys on merge

- **WHEN** a commit is merged to the default branch that changes the worker package
- **THEN** an automated pipeline publishes the worker to production and reports success or failure

#### Scenario: Schema is migration-driven

- **WHEN** the database schema is changed
- **THEN** the change is expressed as a migration file that applies cleanly from an empty database

### Requirement: Pull requests are gated by automated checks

Every pull request SHALL run automated type-checking, linting, and a build for all workspace packages, and SHALL block merge on failure.

#### Scenario: Failing check blocks merge

- **WHEN** a pull request introduces a type error or lint violation
- **THEN** the required checks fail and the pull request cannot be merged

### Requirement: Personal data is stored only in the EU

All persistent stores holding personal or event data SHALL be located in the European Union. The managed database SHALL be created in an EU region. The real-time transport's per-event stateful objects SHALL be created through a namespace restricted to the EU jurisdiction.

#### Scenario: Database region is in the EU

- **WHEN** the managed database project's region is inspected
- **THEN** it is an EU region

#### Scenario: Per-event objects are jurisdiction-pinned

- **WHEN** the real-time worker creates the stateful object for an event
- **THEN** it is created via a namespace handle restricted to the `eu` jurisdiction

### Requirement: EU jurisdiction support on the target plan is verified or escalated

Before this change is considered complete, it SHALL be confirmed on the live platform whether the target hosting plan supports restricting the per-event stateful object to the EU jurisdiction. If it is not supported, the change SHALL record the limitation and the chosen response rather than proceeding silently.

#### Scenario: Jurisdiction restriction confirmed working

- **WHEN** the worker is deployed and an event object is created with the EU-restricted namespace on the target plan
- **THEN** creation succeeds and the outcome is recorded in the change

#### Scenario: Jurisdiction restriction unavailable

- **WHEN** the EU-restricted namespace cannot be used on the target plan
- **THEN** the change records the limitation, and the residency requirement above is marked unmet pending an explicit plan decision by the owner

### Requirement: One real-time object per event with a connect-and-echo contract

The real-time worker SHALL route every connection for a given event identifier to a single stateful object dedicated to that event. In this baseline the object SHALL accept a WebSocket connection and echo any text message back to the sender. It SHALL NOT yet perform authentication or any game logic.

#### Scenario: Connection is accepted and echoes

- **WHEN** a client opens a WebSocket to the worker for event identifier `E` and sends a text message
- **THEN** the same message is returned to that client

#### Scenario: Same event identifier shares one object

- **WHEN** two clients connect for the same event identifier `E`
- **THEN** both connections are served by the same stateful object instance

### Requirement: Placeholder application routes load on target browsers

The web application SHALL expose three distinct routes — a player entry route parameterised by join code, an admin route, and a big-screen route parameterised by event identifier. In this baseline each route renders a placeholder shell. The player and big-screen routes SHALL load on current Safari/iOS and Android Chrome; the admin and big-screen routes SHALL load on current desktop Chrome and Edge.

#### Scenario: Player route loads with a join code

- **WHEN** a user opens the player route with a join code in the URL
- **THEN** a placeholder player screen renders and the join code is read from the URL

#### Scenario: Big-screen route loads with an event id

- **WHEN** a user opens the big-screen route with an event identifier in the URL
- **THEN** a placeholder big-screen shell renders

### Requirement: Errors from both runtimes are captured

Runtime errors in the web application and in the real-time worker SHALL be reported to an error-tracking service.

#### Scenario: Browser error is captured

- **WHEN** an unhandled error occurs in the web application
- **THEN** it appears in the error-tracking service

#### Scenario: Worker error is captured

- **WHEN** an unhandled error occurs in the real-time worker
- **THEN** it appears in the error-tracking service

### Requirement: Free-tier database stays reachable

The system SHALL include an automated mechanism that prevents the managed database from being suspended for inactivity, so that a scheduled test session does not require manual reactivation.

#### Scenario: Keepalive runs on a schedule

- **WHEN** several days pass with no product traffic
- **THEN** an automated job has contacted the database within the provider's inactivity window

### Requirement: Zero recurring infrastructure cost

Every provisioned service SHALL run within a free tier. The setup documentation SHALL state, for each service, the free-tier limit that matters and the plan change required to exceed it later.

#### Scenario: No billable plan is enabled

- **WHEN** the billing settings of every provisioned service are reviewed
- **THEN** each is on a free plan with no active paid subscription
