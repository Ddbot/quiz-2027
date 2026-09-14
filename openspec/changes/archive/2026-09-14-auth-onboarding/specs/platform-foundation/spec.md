## MODIFIED Requirements

### Requirement: Placeholder application routes load on target browsers

The web application SHALL expose three distinct routes — a player entry route parameterised by join code, an admin route, and a big-screen route parameterised by event identifier. The player route implements the real onboarding flow (see the `onboarding` capability) rather than a placeholder. The admin and big-screen routes still render placeholder shells, pending their own milestones. The player and big-screen routes SHALL load on current Safari/iOS and Android Chrome; the admin and big-screen routes SHALL load on current desktop Chrome and Edge.

#### Scenario: Player route loads with a join code

- **WHEN** a user opens the player route with a join code in the URL
- **THEN** the onboarding flow for that join code is presented (see the `onboarding` capability for its full behavior)

#### Scenario: Big-screen route loads with an event id

- **WHEN** a user opens the big-screen route with an event identifier in the URL
- **THEN** a placeholder big-screen shell renders
