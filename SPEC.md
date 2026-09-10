# SPEC.md

## 1. Project Overview

Quiz 2027 (working title) is a custom, single-tenant live-quiz web platform for paid stage shows at bars, venues, functions, and conferences. The audience plays multiple-choice rounds on their own phones — solo or in optional teams of unlimited size — while an **MC** drives a synchronised flow that updates every phone and the venue big screen(s) within two seconds, and an **Operator** casts the big-screen scoreboard via the browser Presentation API. This iteration is a **zero-cost proof of concept**: it validates the end-to-end synchronised-flow mechanism and the scoring model with up to **10 concurrent connections**, entirely on free infrastructure tiers, using a scripted test event rather than a public show. Commercial-scale hardening (500 concurrent, paid plans, dress rehearsal, first paid show, processor DPAs) is a separate phase that begins only if the owner green-lights the PoC. The stack is a React/TypeScript SPA on Vercel, Supabase (Postgres/Auth/Storage, EU region) as the durable system of record, and a self-hosted PartyServer Durable Object per event on the Cloudflare Workers free plan (pinned to the `eu` jurisdiction) as the authoritative real-time layer.

## 2. Goals & Success Criteria

- **G-1 — Synchronised flow proven.** An MC flow action (start, advance, reveal, leaderboard, end) is reflected on every connected player device and the big-screen view within **2 seconds**, verified with **10 concurrent connections**.
- **G-2 — Full happy path runs unattended.** A scripted test event completes without manual intervention: join (anonymous + account) → team lobby → waiting screen → at least 3 MCQ steps mixing timed and untimed → per-step reveals → cumulative leaderboard → final podium.
- **G-3 — Scoring is correct.** Individual and team scores produced by the system match hand-calculated expected values for the scripted test event, including timed "fastest-correct-only", untimed "all-correct", team averages over submitters, tie handling, and zero-answer steps.
- **G-4 — Basic resilience.** A player device reload mid-event rejoins at the current step with correct locked/unlocked state; an MC device reload resumes flow control from the current step; no score is lost if the Durable Object is evicted.
- **G-5 — Zero cost.** Every component runs on a free tier; measured infrastructure spend is €0.
- **G-6 — Decision-ready.** On completion the owner can make an informed go/no-go decision on the commercial phase.

**Deferred commercial-phase targets (recorded for continuity, not in scope here):** 100% zero-incident live-show rate; dress rehearsal; ~50-player events with client rebookings at +12 months; verified 500-concurrent scale; ~20 events / ~1,000 accounts at +12 months.

## 3. Out of Scope

- Native iOS/Android apps; PWA install; offline play.
- Any game type other than single-question MCQ; any real-time competitive game; multiple questions per step.
- Multiple concurrent active events (the data model must not preclude it; the feature is not built).
- Pausing or rewinding a running step ("stop" ends the whole event).
- Manual score correction, answer-key override, and any admin audit log.
- Player-facing report button; player-to-player chat; player media/photo submissions as gameplay.
- Any season-facing UI (season **data capture** is in scope; no leaderboard, no "best player" view, no player season standing).
- Cross-event / cross-season analytics dashboard.
- Marketing email sending (consent capture only).
- Social login; admin MFA.
- Automated image moderation and profile/team **photo** upload (team/participant **name** editing only in the PoC; photo upload is disabled or admin-review-only).
- Sharing any user data with clients, venues, or third parties; merging an anonymous participation into an account.
- Presentation API support for the Operator on Safari/Firefox (Chrome/Edge desktop only).
- Paid infrastructure; verified 500-concurrent scale; dress rehearsal; first paid show.
- Processor DPAs, DPO appointment, and Privacy Policy / Terms of Service drafting (prerequisites for the commercial phase; the PoC runs on test data only but still exercises the consent/acceptance UI and the `eu` configuration).

## 4. Actors & User Roles

| Role | Description | Permissions Summary |
|---|---|---|
| **Player (anonymous)** | Member of the audience with no account; Supabase anonymous JWT. | Join one event via code; set a permanent display name; create/join/leave a team before event start; submit one answer per step (explicit confirm); view own result at reveal, own and team rankings. Cannot: change display name, change team after start, access any admin surface. |
| **Player (account holder)** | As above, with a Supabase email+password account. | All anonymous player capabilities; persistent identity across events; per-event scores linked by season year; export/delete own data; set marketing consent. Email is never shown to anyone but the owner. |
| **Team Captain** | The participant who created a team. | All player capabilities; edit the team name. No power to remove members or moderate. If the team has one member at event start it is dissolved and the member plays solo. |
| **Admin** | The product owner or one trained staff member. Exactly two pre-provisioned accounts (`profile.is_admin = true`, set by SQL). Operates in two modes on two devices. | **Setup (both modes):** create/edit events and steps while `draft`; configure MCQ content, timer, scoring; upload waiting-screen media; pre-event moderation; view live and final rankings; view the per-event analytics dashboard. **MC mode (smartphone):** hold the exclusive flow-control lock during a live event — start, advance, transition, reveal, leaderboard, end/stop, kill switch, claim control. **Operator mode (Chrome/Edge desktop):** run the Presentation API caster; choose what the big screen renders. No flow control while another admin holds the lock, unless it claims control. |
| **Big-Screen Receiver** | A display surface, not a person. A `/screen/:eventId` page opened by the Operator's browser onto a secondary display; connects to the event as `role = screen`. | Render-only: shows the view the Operator selects (question, collecting, results, leaderboard, podium, blank). Never receives player PII it is not told to show. |
| **System / EventRoom** | The per-event Durable Object. | Authoritative during a live event: verifies JWTs, assigns roles, enforces the flow-control lock, owns the timer, orders answer receipts, computes scores at step close, buffers to SQLite, flushes to Postgres. |

## 5. Functional Requirements

Priority tags: **(M)** must-have for the PoC, **(S)** should-have. All requirements are written as testable "SHALL" statements.

### 5.1 Onboarding & Identity

- **FR-001 (M)** — The system SHALL open the player web app from a URL of the form `/e/:joinCode` with the join code pre-filled, reachable from a QR code and by manual entry of the same code. *(REQ §4.1, §11.3)*
- **FR-002 (M)** — The system SHALL let a player join an event anonymously by providing only a display name, creating a Supabase anonymous authenticated session. *(REQ §4.1)*
- **FR-003 (M)** — The system SHALL let a player create an account with email, password, and display name, and SHALL require email verification for the account to be considered confirmed. *(REQ §3, §5.1)*
- **FR-004 (M)** — The system SHALL present a distinct warning screen stating that the display name is permanent, and SHALL require explicit confirmation before the name is persisted. *(REQ §4.1)*
- **FR-005 (M)** — The system SHALL require the player to affirm "I am over 16 years old" via a mandatory checkbox before joining, and SHALL NOT store a date of birth. *(REQ §5.7)*
- **FR-006 (M)** — The system SHALL require acceptance of the Terms of Service and Privacy Policy at join time and SHALL record that acceptance against the profile. *(REQ §4.1)*
- **FR-007 (M)** — The system SHALL offer marketing-communication consent as a separate, unticked, optional checkbox, and account creation SHALL succeed without it. *(REQ §4.1, §5.4)*
- **FR-008 (M)** — The system SHALL create at most one `participant` per (event, profile); repeated joins by the same identity SHALL be idempotent and return the existing participant. *(REQ §11)*
- **FR-009 (M)** — The system SHALL treat the display name as immutable for the life of the participant once confirmed. *(REQ §4.1)*
- **FR-010 (M)** — The system SHALL permit duplicate display names within one event and SHALL disambiguate them internally by participant ID for admin and scoring purposes. *(REQ §4.2, §11.9)*
- **FR-011 (M)** — The system SHALL restrict administrator status to accounts explicitly flagged `is_admin` in the database, with no self-service path to that flag. *(REQ §3, §5.1)*

### 5.2 Teams

- **FR-012 (M)** — The system SHALL let a player create a team, recording the creator as the team captain. *(REQ §4.1, §11)*
- **FR-013 (M)** — The system SHALL let any player of the event join any non-dissolved team with no size cap and no approval step. *(REQ §2.5a)*
- **FR-014 (M)** — The system SHALL let a player leave a team and join another only while the event status is not `live` or `ended`. *(REQ §4.1)*
- **FR-015 (M)** — The system SHALL permit a player to remain in no team and play solo. *(REQ §2.6b)*
- **FR-016 (M)** — The system SHALL lock all team membership at the moment the event transitions to `live`. *(REQ §4.1)*
- **FR-017 (M)** — The system SHALL dissolve any team with fewer than two members at event start and reassign those members to solo play before scoring begins. *(REQ Edge Case #3, §11)*
- **FR-018 (M)** — The system SHALL let a team captain edit the team name (subject to FR-051). Team photo upload is out of scope for the PoC. *(REQ §4.1, §4.3)*
- **FR-019 (M)** — The system SHALL enforce team-name uniqueness (case-insensitive) within one event. *(design decision)*

### 5.3 Event Authoring

- **FR-020 (M)** — The system SHALL let an admin create, read, update, and delete events and their steps while the event status is `draft`. *(REQ §4.1)*
- **FR-021 (M)** — The system SHALL represent an event as an ordered sequence of steps, each step containing exactly one game of type `mcq`. *(REQ §2.2, §2.9a)*
- **FR-022 (M)** — For each MCQ step the system SHALL let the admin configure: question text; answer options; the single correct option; timed or untimed; countdown seconds; points per correct answer (default 1); fixed points awarded to the winning team for that step. *(REQ §4.1 "Scoring setup form")*
- **FR-023 (M)** — The system SHALL let the admin set the event language to French or English, applied to all player-facing and big-screen text for that event. *(REQ §6.6)*
- **FR-024 (M)** — The system SHALL generate one join code and a corresponding QR code per event. *(REQ §2.10a)*
- **FR-025 (M)** — The system SHALL let the admin configure the waiting screen: optional media (image or short video) for the big screen, and an optional countdown target time. *(REQ §4.1)*
- **FR-026 (M)** — The system SHALL freeze all event and step content when the event transitions to `live`, rejecting further edits until the event has ended (after which it is permanently read-only). *(REQ §2.10b, §4.1)*
- **FR-027 (M)** — The system SHALL allow at most one event in `live` status at any time. *(REQ §2.10c)*
- **FR-028 (M)** — The system SHALL stamp every event-bound record with its event ID so that concurrent events can be enabled later without data migration. *(REQ §11.16)*
- **FR-029 (S)** — The system SHALL strip EXIF/metadata from any uploaded media on ingest. *(REQ §5.5, §11.14)*

### 5.4 Live Flow & Synchronisation

- **FR-030 (M)** — The system SHALL maintain authoritative live event state (event status, current step, step status, timer start time, display directive, flow-controller identity) in the event's Durable Object. *(REQ §4.4.1)*
- **FR-031 (M)** — The system SHALL push every change of authoritative state to all connected player devices and big-screen receivers, and SHALL have them reflect it within 2 seconds (verified at 10 concurrent connections). *(REQ §4.4.1 AC1, NFR-001)*
- **FR-032 (M)** — On connect or reconnect, the system SHALL send the client a full authoritative state snapshot including a server clock reference, and the client SHALL reconcile its view to that snapshot. *(REQ §4.4.1 AC2–3)*
- **FR-033 (M)** — The system SHALL let the flow-controller admin: start the event, advance to the next step, launch a transition screen, reveal step results, show the cumulative leaderboard, and end the event. *(REQ §4.1, §2.8b)*
- **FR-034 (M)** — The system SHALL accept flow-control commands only from the connection currently holding the flow-control lock and SHALL reject them from any other connection. *(REQ §4.4.1 AC5, §2.a/#5)*
- **FR-035 (M)** — The system SHALL make all flow transitions idempotent, so that duplicate or rapid commands do not double-advance or skip state. *(REQ §4.4.1 Edge Cases)*
- **FR-036 (M)** — The system SHALL allow an admin connection to claim the flow-control lock (Operator/MC takeover), transferring control and resuming from the exact current step with all state intact. *(REQ §2.1a, Edge Case #6, §4.4.1)*
- **FR-037 (M)** — The system SHALL, after an MC device disconnects and reconnects, allow that admin to resume flow control without loss of event state or scores. *(REQ Edge Case #6)*
- **FR-038 (M)** — The system SHALL NOT provide any mechanism to pause or rewind a step once it is active. *(REQ §11.4–5)*
- **FR-039 (S)** — The system SHALL provide an admin "kill switch" that immediately broadcasts a blank/freeze directive to all big-screen receivers and player devices, and a matching command to clear it. *(REQ §4.2)*

### 5.5 MCQ Round, Timer & Answering

- **FR-040 (M)** — The system SHALL give every step a countdown timer, where 0 seconds denotes an untimed step. *(REQ §4.1)*
- **FR-041 (M)** — The system SHALL require a player to select one option and then press an explicit confirm control to submit an answer. *(REQ §4.1, §4.3a)*
- **FR-042 (M)** — The system SHALL record at most one answer per (step, participant); once submitted it is immutable. *(REQ §4.4.3 AC2)*
- **FR-043 (M)** — The system SHALL derive the timer expiry from the authoritative timer start plus the configured countdown, and SHALL reject any answer submitted after expiry (allowing a small fixed latency grace). *(REQ §4.4.1 AC4, §2.8b)*
- **FR-044 (M)** — On timer expiry the system SHALL lock answer input on all clients for that step and SHALL NOT auto-advance the flow; only an explicit MC command changes the step. *(REQ §2.8b)*
- **FR-045 (M)** — The system SHALL stamp each answer with a server receipt time and a monotonic receipt sequence number assigned by the Durable Object. *(REQ §2.8a, §11 timing)*
- **FR-046 (M)** — The system SHALL reveal a player's own result (correct/incorrect and points) only when the MC triggers the reveal step or when the step timer ends, whichever comes first. *(REQ §4.1 F, discovery Q6)*

### 5.6 Scoring & Rankings

- **FR-047 (M)** — For an **untimed** MCQ step, the system SHALL award `points_correct` to every participant whose answer matches the correct option. *(REQ §2.8a, §4.1)*
- **FR-048 (M)** — For a **timed** MCQ step, the system SHALL award `points_correct` to only the participant with the earliest correct answer, ranked by (server receipt time, receipt sequence); all other participants score 0 for that step. *(REQ §2.8a option iii)*
- **FR-049 (M)** — Where two or more correct answers share an identical server receipt time at millisecond precision in a timed step, the system SHALL treat them as tied and award each of them `points_correct`. *(REQ §11.9 (assumptions), §2.7)*
- **FR-050 (M)** — The system SHALL compute a team's per-step score as the arithmetic mean of the per-step points of only those team members who submitted an answer for that step. *(REQ §2.7c)*
- **FR-051 (M)** — The system SHALL identify the team(s) with the highest per-step mean as the step winner(s) and award each the step's `team_award_points`; tied winners each receive the full award. *(REQ §2.6a, §38 of brief)*
- **FR-052 (M)** — The system SHALL exclude from a step's team ranking any team where no member submitted an answer, and SHALL record that team's step award as 0. *(REQ §2.7c, Edge Case #3)*
- **FR-053 (M)** — Where no participant answers a step, the system SHALL record 0 points for all participants and 0 team awards for that step. *(REQ Edge Case #3)*
- **FR-054 (M)** — The system SHALL maintain a cumulative individual ranking as the sum of per-step individual points across all steps of the event. *(REQ §4.1)*
- **FR-055 (M)** — The system SHALL maintain a cumulative team ranking as the sum of per-step team awards across all steps of the event. *(REQ §2.7a)*
- **FR-056 (M)** — The system SHALL allow a player to join an event after it has started; that player SHALL begin at 0 points, SHALL be eligible to score only from the step active at the time of joining onward, and SHALL play solo (no team join/create). *(REQ §4.1, Edge Case #2)*
- **FR-057 (M)** — The system SHALL make live individual and team rankings available to admin views and to the big-screen leaderboard directive. *(REQ §3, §4.1)*

### 5.7 Big Screen & Presentation

- **FR-058 (M)** — The system SHALL provide a `/screen/:eventId` receiver page that connects to the event as `role = screen` and renders only the view currently directed by the Operator. *(REQ §4.4.4)*
- **FR-059 (M)** — The system SHALL let the Operator initiate a Presentation API session from a Chrome/Edge desktop browser to one or more secondary displays, all showing identical content. *(REQ §2.1b, §4.4.4)*
- **FR-060 (M)** — The system SHALL render the big-screen view visually distinct from the player view and meeting high-contrast requirements for large-format, low-light viewing. *(REQ §6.5)*
- **FR-061 (M)** — The system SHALL NOT display any player-entered content (display name, team name) on the big screen unless the Operator has explicitly selected a view that includes it. *(REQ §3.3b, §4.4.4 AC3)*
- **FR-062 (M)** — The system SHALL let the Operator choose the big-screen view among at least: waiting screen, question, collecting answers, step results, cumulative leaderboard, final podium, and blank. *(REQ §4.4.4)*
- **FR-063 (M)** — On reconnect, a big-screen receiver SHALL render the current authoritative state, not replay missed transitions. *(REQ §4.4.1 Edge Cases, §4.4.4 Edge Cases)*
- **FR-064 (M)** — The system SHALL show waiting-screen media only on the big screen; player devices SHALL show only a countdown and/or a lightweight branding image during the waiting state. *(REQ §5.4 discovery, §11.10)*

### 5.8 Event End & Results

- **FR-065 (M)** — The system SHALL treat the MC "stop" command as "end the event". *(REQ §11.4)*
- **FR-066 (M)** — On event end the system SHALL lock all scores, compute and persist final individual and team rankings, and set the event to permanently read-only. *(REQ §4.1, §4.4 "Event lifecycle end")*
- **FR-067 (M)** — On event end the system SHALL make a final podium view available for individuals and teams on the big screen. *(REQ §4.1 B)*
- **FR-068 (M)** — The system SHALL persist every answer and every step result to the Postgres system of record; the Durable Object SHALL NOT be the sole store of any committed result. *(REQ §11.19, NFR-014)*

### 5.9 Moderation

- **FR-069 (M)** — The system SHALL validate every display name and team name against a French + English wordlist profanity filter at entry and reject a match with a retry prompt. *(REQ §5.6)*
- **FR-070 (M)** — The system SHALL let an admin hide or rename any participant or any team from the console, before or during an event. *(REQ §5.6)*
- **FR-071 (M)** — The system SHALL exclude hidden participants and hidden teams from big-screen views while retaining their answers and scores in the record. *(REQ §5.6, design decision)*

### 5.10 Analytics

- **FR-072 (M)** — The system SHALL provide an admin-only per-event dashboard showing: participant count, completion rate, per-question correct/incorrect breakdown, average response time, and final individual and team rankings. *(REQ §4.1, discovery Q7)*
- **FR-073 (M)** — The system SHALL define completion rate as answers submitted divided by the number of steps for which the participant was present (from their join step onward), aggregated across participants. *(REQ discovery Q7a)*
- **FR-074 (M)** — The system SHALL NOT display any player email address at row level, or anywhere, in the dashboard. *(REQ §3.8a, §5.9)*

### 5.11 Season Data & GDPR

- **FR-075 (M)** — The system SHALL derive an event's season year from its start date and link each account holder's per-event totals to that season year. *(REQ §3.7c, §11.8)*
- **FR-076 (M)** — The system SHALL NOT expose any season-aggregated view to any role in the PoC. *(REQ §4.3, discovery Q5)*
- **FR-077 (M)** — The system SHALL let an account holder export their personal data. *(REQ §5.8)*
- **FR-078 (M)** — The system SHALL let an account holder delete their account, purging profile data while retaining their historical scores in a form unlinked from their identity. *(REQ §5.8)*
- **FR-079 (M)** — The system SHALL purge anonymous participants' data (display name, answers, per-step and total scores) 90 days after the event ends. *(REQ §3.7a, §5.8)*
- **FR-080 (S)** — The system SHALL provide a routine to archive a completed season's detailed data at season close. *(REQ §3.7c, §5.8 — may land in the commercial phase)*
- **FR-081 (M)** — The system SHALL NOT transmit any user data to any third party beyond its own processors (Supabase, Vercel, Cloudflare, Sentry). *(REQ §5.9)*

### 5.12 Resilience & Recovery

- **FR-082 (M)** — The Durable Object SHALL write each accepted answer to its own durable SQLite storage immediately on receipt, before acknowledging. *(REQ §11.19, NFR-014)*
- **FR-083 (M)** — The Durable Object SHALL flush answers and computed results to Postgres at each step close and at event end, retrying with backoff on failure without blocking the live flow. *(REQ §11.19)*
- **FR-084 (M)** — If the Durable Object is evicted or restarted, the system SHALL rehydrate authoritative state from its SQLite storage (and, if needed, Postgres) to the last committed step. *(REQ §8 Recovery, §11.19)*
- **FR-085 (M)** — A player device that reloads or briefly loses connection SHALL rejoin the current step with correct locked/unlocked input state and no duplicate answer. *(REQ §4.4.1 AC3, §4.2)*
- **FR-086 (M)** — The client SHALL auto-reconnect with backoff after a dropped connection; there is no offline play and no answer queueing. *(REQ §4.2, §4.3a)*

### 5.13 Test & Validation

- **FR-087 (M)** — The system SHALL include an automated harness that drives up to 10 simulated client connections through a scripted test event and asserts the resulting scores against hand-calculated expected values. *(REQ §4.2, §2.4 PoC)*

## 6. Non-Functional Requirements

- **NFR-001 — [Performance]** The system SHALL propagate any authoritative state change to all connected clients within 2 seconds, verified at 10 concurrent connections; the design SHALL NOT contain choices that structurally prevent reaching 500 later (e.g. per-client polling, unbounded broadcast payloads). *(REQ §8, §6.3)*
- **NFR-002 — [Scalability]** The system SHALL use exactly one Durable Object per event as the real-time authority; connection count (players + admins + screens) SHALL be counted against that object. *(REQ §11.19, §6.3)*
- **NFR-003 — [Availability]** The PoC SHALL tolerate the Supabase free-tier project being paused between sessions; a documented unpause step or a keepalive cron SHALL run before each test. No uptime SLA applies to the PoC. *(REQ §11.25, §6.4)*
- **NFR-004 — [Security]** All authentication SHALL use Supabase-issued JWTs. The Durable Object SHALL verify the JWT signature against cached Supabase JWKS on connect and SHALL derive role and flow-control rights server-side, never from client-supplied claims beyond the verified token. *(REQ §4.5, §8)*
- **NFR-005 — [Security]** Postgres Row Level Security SHALL enforce that a player accesses only their own participant row and public event/team data for their event; that content tables are read-only once `event.status <> 'draft'`; and that admin-only data requires `is_admin`. *(REQ §8, §4.5)*
- **NFR-006 — [Security]** The Supabase service-role key SHALL exist only as a Cloudflare Worker secret and SHALL never be shipped to any browser context. *(REQ §4.5)*
- **NFR-007 — [Privacy / Data residency]** Personal data SHALL be stored only in the EU: the Supabase project in an EU region, and every Durable Object created through a namespace pinned to the `eu` jurisdiction. *(REQ §5.4, §11.19)*
- **NFR-008 — [Privacy]** A player email address SHALL never be transmitted to any client other than the owning account holder's own session and admin surfaces that explicitly need it (never the big screen, never other players, never dashboard rows). *(REQ §3.8a, §5.5)*
- **NFR-009 — [Data retention]** The system SHALL implement the retention rules of REQ §5.8: anonymous data purged 90 days post-event; account profile purged on deletion with scores anonymised; season detail archived at close. *(REQ §5.8)*
- **NFR-010 — [Accessibility]** The player web app SHALL meet WCAG 2.2 AA, with large touch targets, no reliance on colour alone for correctness feedback, and keyboard/screen-reader operability of the core answer flow. *(REQ §6.5)*
- **NFR-011 — [Accessibility]** The big-screen views SHALL use a high-contrast palette suitable for large-format viewing in low light. *(REQ §6.5)*
- **NFR-012 — [Internationalisation]** Player-facing and big-screen text SHALL be available in French and English, selected per event; the admin console SHALL be French only. Date and number formatting SHALL be locale-aware for both. No RTL support. *(REQ §6.6, discovery Q7b)*
- **NFR-013 — [Cost]** Every component SHALL run within a free tier; measured recurring infrastructure cost SHALL be €0 for the PoC. *(REQ §6.4)*
- **NFR-014 — [Durability]** No committed answer or score SHALL exist only in Durable Object memory; each SHALL be in Durable Object SQLite immediately and in Postgres by the end of its step. Recovery point SHALL be the last committed step. *(REQ §8, §11.19)*
- **NFR-015 — [Compatibility]** The player and big-screen surfaces SHALL support current Safari/iOS and Android Chrome; the Operator/Presentation surface SHALL support current Chrome and Edge on desktop. *(REQ §4.1, §6.1)*
- **NFR-016 — [Observability]** Sentry SHALL capture errors from the browser app and the Worker; the Durable Object SHALL emit structured logs for every flow transition, scoring computation, and Postgres flush outcome. *(REQ §4.1, §8)*
- **NFR-017 — [Maintainability]** MCQ rules, timer logic, and scoring SHALL live in framework-agnostic TypeScript modules with no Durable Object or Cloudflare API dependency, imported by the Durable Object; a migration to raw Durable Objects or another runtime SHALL not require rewriting game logic. *(REQ §11.12, §2.2 container principle)*
- **NFR-018 — [Deployment]** Only two environments SHALL exist — local and production. Frontend deploys via Vercel Git integration on `main`; the Worker via a GitHub Action running `wrangler deploy`; database schema via Supabase CLI migrations. *(REQ §9.1, §6.2, discovery Q4)*
- **NFR-019 — [Timing basis]** Timed-step ordering SHALL use Durable Object server receipt time; it is accepted that players on slower connections are disadvantaged. *(REQ §11.9, discovery Q9)*

## 7. Architecture Overview

### 7.1 Component Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │                Vercel (Hobby)                │
                        │      React 18 + TS + Vite SPA, shadcn/ui      │
                        │  ┌──────────┬───────────────┬─────────────┐   │
                        │  │ Player   │ Admin console │ Big-screen  │   │
                        │  │ /e/:code │ /admin (FR)   │ /screen/:id │   │
                        │  └────┬─────┴───────┬───────┴──────┬──────┘   │
                        └───────┼─────────────┼──────────────┼──────────┘
             JWT + REST/RPC     │             │ WSS          │ WSS
            (supabase-js, RLS)  │             │ (partysocket)│
                    ┌───────────▼─────────┐   │              │
                    │  Supabase (Free,EU) │   │   ┌──────────▼───────────────────┐
                    │  Auth  — anon + email│  │   │  Cloudflare Workers (Free)   │
                    │  Postgres — RLS, SoR │◀─┼───┤  self-hosted PartyServer     │
                    │  Storage — media     │svc│   │  ┌────────────────────────┐ │
                    └──────────▲───────────┘key│   │  │ EventRoom DO           │ │
                               │               │   │  │  (1 / event, eu juris) │ │
                               │  flush / step  │   │  │  authoritative state   │ │
                               └───────────────┼───┤  │  timer + receipt order │ │
                                               │   │  │  step-close scoring    │ │
                                               │   │  │  SQLite buffer         │ │
                                               │   │  └────────────────────────┘ │
                                               │   └─────────────────────────────┘
                        Sentry (Free) ◀── browser SDK + Workers SDK
```

Runtime flow of a step: MC sends `mc:advance` over WSS → EventRoom DO validates the flow-control lock, sets the new step `active` and `timer_started_at`, broadcasts `state` to every connection → players answer with `answer:submit` → DO stamps `(submitted_at, receipt_seq)`, writes to SQLite, ack → timer expiry (server) or `mc:lock` → step `locked` → `mc:reveal` → DO runs the scoring module, writes `step_result_*` + `answer` rows to Postgres via the service-role key, broadcasts `step_results` and `rankings`.

### 7.2 Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite (SPA) | No SSR/SEO need; fewest moving parts for a solo developer; approved. |
| UI | shadcn/ui + Tailwind CSS | Owner's choice; bespoke on-brand styling without a library "look". |
| Client data | TanStack Query for REST/RPC; `partysocket` for the live channel; a small Zustand store holding the single authoritative live snapshot | Clean separation of durable data vs. live state; one reconciliation path. |
| Real-time | `partyserver` library on Cloudflare Workers; one SQLite-backed Durable Object per event; namespace pinned via `.jurisdiction("eu")`; `wrangler` for deploy | Confirmed. A per-event single-threaded authority is the exact fit for the lockstep requirement; free plan covers the PoC and well beyond; scaling is a plan toggle. |
| Database | Supabase Postgres, RLS enabled, Supabase CLI migrations | Owner's choice; relational model fits scoring/rankings; RLS removes the need for a custom API tier. |
| Auth | Supabase Auth: anonymous sign-in for guests, email+password for accounts, `profile.is_admin` set by SQL for the two admins | One JWT authorises both Postgres (via RLS) and the Durable Object (via JWKS); no second credential store. |
| DO→DB writes | `@supabase/supabase-js` with the service-role key as a Worker secret | The DO is trusted server code; direct writes are simplest and safe; key never reaches a browser. |
| Media | Supabase Storage | In-stack; big-screen-only playback keeps bandwidth negligible. |
| Error tracking | Sentry (`@sentry/react` + `@sentry/cloudflare`), free tier | Surface failures during scripted test runs. |
| Testing | Vitest (scoring + reducer units), Playwright (end-to-end), a Node `partysocket` script (10 simulated clients) | The scripted test event is the PoC acceptance gate and must be automated. |
| Profanity filter | A bundled FR+EN wordlist library, evaluated client- and server-side | REQ §5.6; no external service. |
| QR code | `qrcode` npm, rendered client-side in the admin console | No external service. |
| CI/CD | GitHub; Vercel Git integration (frontend); GitHub Action → `wrangler deploy` (Worker); `supabase db push` (schema) | Matches the local + production-only constraint. |

### 7.3 Data Model

All tables carry `event_id` where event-bound (FR-028). Timestamps are `timestamptz`. IDs are UUID v4 unless noted.

**profile** — mirrors `auth.users`.
- `id` UUID PK (= `auth.uid`)
- `display_name` text
- `email` text NULL (NULL for anonymous)
- `is_anonymous` boolean
- `is_admin` boolean default false
- `over16_ack` boolean
- `tos_accepted_at` timestamptz
- `marketing_consent` boolean default false
- `created_at`, `deleted_at` timestamptz NULL
- Relationships: 1—N `participant`; 1—N `event` (as creator).

**event**
- `id` UUID PK
- `join_code` text UNIQUE
- `title` text
- `language` text CHECK in (`fr`,`en`)
- `status` text CHECK in (`draft`,`live`,`ended`) default `draft`
- `venue_label` text NULL
- `waiting_media_path` text NULL
- `waiting_countdown_target` timestamptz NULL
- `current_step_id` UUID NULL → step
- `season_year` int NULL (set at start from `started_at`)
- `created_by` UUID → profile
- `started_at`, `ended_at` timestamptz NULL
- `created_at`
- Partial unique index: at most one row with `status = 'live'`.
- Relationships: 1—N `step`, `team`, `participant`.

**step**
- `id` UUID PK
- `event_id` UUID → event
- `position` int  (UNIQUE per event)
- `game_type` text CHECK in (`mcq`) default `mcq`
- `timed` boolean
- `countdown_seconds` int  (0 ⇒ untimed)
- `points_correct` int default 1
- `team_award_points` int
- `status` text CHECK in (`pending`,`active`,`locked`,`revealed`,`done`) default `pending`
- `timer_started_at` timestamptz NULL
- Relationships: 1—1 `game_mcq`; 1—N `answer`, `step_result_participant`, `step_result_team`.

**game_mcq** — the container seam for future game types.
- `step_id` UUID PK → step
- `question_text` text
- `options` jsonb — array of `{ id: string, label: string }`
- `correct_option_id` text

**team**
- `id` UUID PK
- `event_id` UUID → event
- `name` text  (UNIQUE per event, case-insensitive)
- `captain_participant_id` UUID → participant
- `dissolved` boolean default false
- `hidden` boolean default false
- `created_at`

**participant** — one per person per event; the unit that plays.
- `id` UUID PK
- `event_id` UUID → event
- `profile_id` UUID → profile
- `display_name` text  (permanent snapshot)
- `team_id` UUID → team NULL
- `joined_at` timestamptz
- `joined_at_position` int  (0 = pre-start; N = late joiner from step N)
- `hidden` boolean default false
- UNIQUE (`event_id`, `profile_id`)

**answer**
- `id` UUID PK
- `step_id` UUID → step
- `participant_id` UUID → participant
- `option_id` text
- `submitted_at` timestamptz  (server, from DO)
- `receipt_seq` bigint  (DO monotonic)
- `is_correct` boolean
- `scored_points` int
- UNIQUE (`step_id`, `participant_id`)

**step_result_participant**
- `step_id` UUID → step
- `participant_id` UUID → participant
- `points` int
- PK (`step_id`, `participant_id`)

**step_result_team**
- `step_id` UUID → step
- `team_id` UUID → team
- `avg_score` numeric
- `is_winner` boolean
- `awarded_points` int
- PK (`step_id`, `team_id`)

**event_final_participant**
- `event_id` UUID → event
- `participant_id` UUID → participant
- `total_points` int
- `rank` int
- PK (`event_id`, `participant_id`)

**event_final_team**
- `event_id` UUID → event
- `team_id` UUID → team
- `total_awarded` int
- `rank` int
- PK (`event_id`, `team_id`)

**season_score** — VIEW: `profile_id`, `season_year`, `sum(total_points)` over `event_final_participant` joined to non-anonymous, non-deleted `profile`. Read by no UI in the PoC.

### 7.4 API / Interface Contracts

#### 7.4.1 REST / RPC (via supabase-js; RLS-enforced; base = Supabase project URL)

**POST /rest/v1/rpc/join_event**
- Auth: Bearer JWT (anonymous or account)
- Request: `{ join_code: string, display_name: string }`
- Response 200: `{ participant: {...}, event: {...snapshot} }`
- Response 200 (idempotent): existing participant if already joined
- Response 400: `{ error: "profanity" | "event_not_joinable" | "invalid_code" }`
- Response 401: Unauthorized

**POST /rest/v1/rpc/create_team**
- Auth: participant JWT; only while `event.status <> 'live' and <> 'ended'`
- Request: `{ event_id: uuid, name: string }`
- Response 201: `{ team: {...} }` with caller set as `captain_participant_id`
- Response 409: `{ error: "name_taken" }`
- Response 403: event already live/ended

**POST /rest/v1/rpc/join_team** — `{ team_id }` → 200 `{ participant }`; 403 if event live/ended; 404 if dissolved.
**POST /rest/v1/rpc/leave_team** — `{}` → 200 `{ participant }`; 403 if event live/ended.
**POST /rest/v1/rpc/rename_team** — `{ team_id, name }`; captain only; 409 `name_taken`; 400 `profanity`.

**POST /rest/v1/rpc/moderate_participant** — admin only — `{ participant_id, hidden?: bool, display_name?: string }` → 200.
**POST /rest/v1/rpc/moderate_team** — admin only — `{ team_id, hidden?: bool, name?: string }` → 200.

**GET /rest/v1/event?join_code=eq.{code}** — public — event summary for the lobby (no admin fields).
**GET /rest/v1/team?event_id=eq.{id}** — participant — non-dissolved teams + member counts.
**GET /rest/v1/participant?id=eq.{me}** — participant — own record.

**POST /rest/v1/rpc/event_dashboard** — admin only — `{ event_id }` → `{ participant_count, completion_rate, per_question: [{step_id, correct, incorrect}], avg_response_ms, final_participants: [...], final_teams: [...] }`. No email fields.

**Event/step authoring** — standard PostgREST table writes on `event`, `step`, `game_mcq`, guarded by RLS: `is_admin` AND target `event.status = 'draft'`.

**POST /rest/v1/rpc/export_my_data** — any JWT — returns the caller's profile + participants + answers as JSON.
**POST /rest/v1/rpc/delete_my_account** — any JWT — purges profile fields, sets `deleted_at`, rewrites the caller's `participant.display_name`/`profile_id` links to an anonymised sentinel while keeping score rows.

#### 7.4.2 WebSocket protocol — EventRoom Durable Object

Endpoint: `wss://{worker-host}/parties/event/{eventId}?token={supabase_jwt}`
On connect the DO verifies the JWT against Supabase JWKS, resolves `profile_id`, `is_anonymous`, `is_admin`, and the caller's `participant` for `eventId`, then assigns `role ∈ {player, admin, screen}` (`screen` when the connection presents the screen query flag and a valid admin-issued screen token).

**Client → Server**

| Message | Allowed role | Payload | Effect / validation |
|---|---|---|---|
| `answer:submit` | player | `{ stepId, optionId }` | Rejected unless step `active` and now ≤ expiry + grace; one per (step, participant); stamped `(submitted_at, receipt_seq)`; written to SQLite before ack |
| `mc:start` | flow-controller | `{}` | `event → live`; teams lock; dissolve <2-member teams; step 1 → `active`; set `timer_started_at`; set `season_year` |
| `mc:advance` | flow-controller | `{}` | current step → `done`; next step → `active`; idempotent |
| `mc:lock` | flow-controller | `{}` | current step → `locked` (also triggered automatically at expiry) |
| `mc:reveal` | flow-controller | `{}` | run scoring module; persist `answer` + `step_result_*`; step → `revealed`; broadcast `step_results` + `rankings` |
| `mc:show_leaderboard` | flow-controller | `{}` | broadcast `rankings` and set display directive |
| `mc:end` | flow-controller | `{}` | finalise; write `event_final_*`; `event → ended`; broadcast `podium` |
| `mc:kill_switch` | any admin | `{ on: boolean }` | broadcast blank/freeze directive |
| `mc:claim_control` | any admin | `{}` | transfer flow-control lock to caller |
| `operator:display` | any admin | `{ view: "waiting"|"question"|"collecting"|"results"|"leaderboard"|"podium"|"blank" }` | set the directive for `role = screen` |
| `ping` | any | `{}` | presence/heartbeat |

**Server → Client**

| Message | Payload |
|---|---|
| `state` | `{ eventStatus, step: { id, position, timed, countdownSeconds, status, timerStartedAt } | null, serverNow, display, controllerId }` — sent on connect, reconnect, and every change |
| `roster` | `{ players: int, teams: int, connected: int }` |
| `step_results` | `{ stepId, participants: [{ participantId, isCorrect, points }], teams: [{ teamId, avgScore, isWinner, awardedPoints }] }` |
| `rankings` | `{ individuals: [{ participantId, displayName, total, rank }], teams: [{ teamId, name, total, rank }] }` |
| `own_result` | to a single player at reveal/expiry: `{ stepId, isCorrect, points }` |
| `error` | `{ code, message }` |

**DO invariants:** timer expiry = `timer_started_at + countdown_seconds` checked server-side with a fixed grace; timed steps score only the earliest correct `(submitted_at, receipt_seq)`; team step score = mean of submitting members' points; all transitions idempotent; every accepted answer in SQLite before ack; step results flushed to Postgres on `reveal`, final rankings on `end`, each with bounded retry.

### 7.5 Security & Auth

Authentication is Supabase Auth end to end. Anonymous players receive a genuine but `is_anonymous` JWT via anonymous sign-in; account holders authenticate with email and password; the two admins are ordinary accounts with `profile.is_admin` set directly in SQL — there is no self-service route to admin. The **same JWT** authorises the SPA against Postgres (through RLS) and the Durable Object (through JWKS signature verification); the DO derives role and flow-control rights server-side and trusts no client-asserted privilege. Authorisation model is role-based: RLS policies scope players to their own `participant` row plus public event/team data for their event, make content tables read-only once `event.status <> 'draft'`, and gate admin data on `is_admin`; the DO enforces a single-holder flow-control lock. The Durable Object writes to Postgres with a Supabase **service-role key stored only as a Cloudflare Worker secret**. All transit is TLS (HTTPS/WSS) — Vercel, Cloudflare, and Supabase each terminate TLS. Data at rest is encrypted by Supabase (Postgres) and Cloudflare (Durable Object SQLite) platform defaults. Data residency is enforced by an EU Supabase region and a Durable Object namespace pinned to the `eu` jurisdiction. Threats explicitly mitigated: late/replayed answers (server timer + unique constraint), flow-control spoofing (server-side `is_admin` + lock), score tampering (scoring runs only in the DO; clients receive computed results), cross-event access (RLS scoping + one isolated DO per event), and PII leakage to the big screen (screen role receives only Operator-selected views). Known residual risk: no admin MFA in the PoC — mitigated by only two manually provisioned accounts and test-only data.

### 7.6 Infrastructure & Deployment

**Environments:** local and production only. Local = `vite dev` + `wrangler dev` + a shared Supabase development project (or `supabase start`). Production = one Vercel project, one Cloudflare Worker, one Supabase project (EU region). Vercel per-PR preview deployments are the only ephemeral surface and point at the production Supabase/Worker or are skipped.

**Deployment strategy:** rolling / replace. The frontend deploys automatically on merge to `main` via Vercel's Git integration. The Worker deploys via a GitHub Action running `wrangler deploy` on merge to `main`, with `wrangler secret` values (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `SENTRY_DSN`) supplied from GitHub Action secrets. Database schema changes are Supabase CLI migrations in `supabase/migrations`, applied with `supabase db push` (manually or in the same Action). No blue-green or canary in the PoC.

**CI pipeline (GitHub Actions):** on PR — typecheck, ESLint, Vitest, Playwright (headless), build. On merge to `main` — the above, then deploy Worker, then (optional) `supabase db push`. Vercel builds independently on its Git hook.

**Observability:** Sentry for the browser app (`@sentry/react`) and the Worker (`@sentry/cloudflare`); the Durable Object emits structured JSON logs for every flow transition, scoring run, and Postgres flush result, inspected with `wrangler tail` during test runs. A GitHub Actions scheduled workflow pings a Supabase health endpoint every ~5 days to prevent free-tier auto-pause.

**Backups:** Supabase free-tier automated backups plus the per-step Postgres flush (FR-083). Pre-event on-demand backups are a commercial-phase addition (Q-004).

## 8. Implementation Plan

Milestones are ordered by dependency. Effort: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks, XL ≈ >2 weeks (solo).

- **MILESTONE-01: Scaffold & infrastructure wiring**
  - Scope: Vite+TS+React+Tailwind+shadcn app shell with the three route trees stubbed; Supabase project (EU) + local dev; Cloudflare Worker + `partyserver` "hello" Durable Object deployed on the free plan with an `eu`-jurisdiction namespace; GitHub repo, Vercel project, Worker deploy Action, Sentry projects; keepalive cron.
  - Dependencies: none
  - Acceptance criteria:
    - [ ] `main` auto-deploys the SPA to Vercel and the Worker via Action
    - [ ] A browser page opens a WSS connection to the Durable Object and echoes a message
    - [ ] `wrangler` config shows the DO namespace created with `jurisdiction: "eu"` (or Q-001 escalated if unavailable on the free plan)
    - [ ] Sentry receives a test error from both the browser and the Worker
  - Estimated effort: M

- **MILESTONE-02: Data model, migrations & RLS**
  - Scope: all tables and the `season_score` view from §7.3; RLS policies per §7.5; seed script; two admin accounts flagged via SQL.
  - Dependencies: MILESTONE-01
  - Acceptance criteria:
    - [ ] Migrations apply cleanly from empty via `supabase db push`
    - [ ] RLS test suite: a player JWT cannot read another participant's row, cannot write content tables, cannot read admin data; an admin JWT can
    - [ ] Partial unique index rejects a second `live` event
  - Estimated effort: M

- **MILESTONE-03: Auth & onboarding**
  - Scope: anonymous sign-in path; account create/login with email verification; permanent-name warning screen; 16+ checkbox; ToS/Privacy acceptance; separate marketing consent; profanity check on display name; idempotent `join_event`.
  - Dependencies: MILESTONE-02
  - Acceptance criteria:
    - [ ] FR-001..FR-009, FR-011 demonstrably pass
    - [ ] Re-joining the same event with the same identity returns the same participant
    - [ ] A profane display name is rejected with a retry
    - [ ] Account works with marketing consent unchecked
  - Estimated effort: M

- **MILESTONE-04: Event authoring console**
  - Scope: French admin console; draft event CRUD; ordered steps; MCQ config form (question, options, correct, timed, countdown, points_correct, team_award_points); language selector; join code + QR generation; waiting-screen media upload (EXIF strip) + countdown target; freeze-on-start guard.
  - Dependencies: MILESTONE-02
  - Acceptance criteria:
    - [ ] FR-020..FR-027, FR-029 pass
    - [ ] Editing any content of a `live` event is rejected by both UI and RLS
    - [ ] QR resolves to `/e/:code` with the code pre-filled
  - Estimated effort: M

- **MILESTONE-05: EventRoom Durable Object core**
  - Scope: JWT/JWKS verification on connect; role assignment; authoritative state object; `state` snapshot on connect/reconnect with server clock; broadcast on change; flow-control lock + `mc:claim_control`; SQLite persistence of state; idempotent transition scaffolding; portable game-logic module boundary (NFR-017).
  - Dependencies: MILESTONE-01, MILESTONE-02
  - Acceptance criteria:
    - [ ] FR-030, FR-032, FR-034..FR-037 pass
    - [ ] A reconnecting client receives a snapshot matching the authoritative state
    - [ ] Non-admin flow-control commands are rejected
    - [ ] DO eviction (simulated) rehydrates state from SQLite
  - Estimated effort: L

- **MILESTONE-06: Team lobby**
  - Scope: create/join/leave/rename team; captain assignment; open join, no cap; pre-start-only mutation; lock + <2-member dissolution at `mc:start`; solo play.
  - Dependencies: MILESTONE-03, MILESTONE-05
  - Acceptance criteria:
    - [ ] FR-012..FR-019 pass
    - [ ] After `mc:start`, team mutation endpoints return 403
    - [ ] A 1-member team is dissolved and its member is solo at start
  - Estimated effort: M

- **MILESTONE-07: Live MCQ round**
  - Scope: `mc:start/advance/lock`; per-step timer authority with grace; player question view; select + explicit confirm; `answer:submit` with `(submitted_at, receipt_seq)`; hard input lock at expiry; no auto-advance; waiting-state split (big screen vs player).
  - Dependencies: MILESTONE-05, MILESTONE-06
  - Acceptance criteria:
    - [ ] FR-031, FR-040..FR-045, FR-064 pass
    - [ ] Propagation of `mc:advance` to 10 simulated clients is < 2 s
    - [ ] Answers after expiry + grace are rejected server-side
    - [ ] One answer per participant per step is enforced
  - Estimated effort: L

- **MILESTONE-08: Scoring engine & persistence**
  - Scope: framework-agnostic scoring module — untimed all-correct, timed fastest-correct-only, identical-timestamp ties, team mean over submitters, tied team winners, zero-submitter and zero-answer handling, late-joiner eligibility; cumulative individual and team rankings; `mc:reveal` flush of `answer` + `step_result_*` to Postgres with retry; `own_result` to each player.
  - Dependencies: MILESTONE-07
  - Acceptance criteria:
    - [ ] FR-046..FR-057, FR-068, FR-082, FR-083 pass
    - [ ] Vitest covers every scoring branch with fixture events
    - [ ] Killing the Supabase connection during a flush does not stall the live flow; the flush succeeds on retry
  - Estimated effort: L

- **MILESTONE-09: Big screen & Presentation API**
  - Scope: `/screen/:eventId` receiver connecting as `role = screen`; Operator caster (Presentation API, Chrome/Edge); `operator:display` view switching; high-contrast views for waiting/question/collecting/results/leaderboard/podium/blank; reconnect renders current state; mirrored multi-screen.
  - Dependencies: MILESTONE-07, MILESTONE-08
  - Acceptance criteria:
    - [ ] FR-058..FR-063 pass
    - [ ] No player-entered content appears on screen except in an Operator-selected view
    - [ ] A screen reload shows current state, not a replay
  - Estimated effort: M

- **MILESTONE-10: Reveal, leaderboard, end & finalisation**
  - Scope: `mc:reveal`, `mc:show_leaderboard`, `mc:end` lifecycle; final `event_final_*` materialisation; permanent read-only; podium view; per-question feedback timing (reveal or timer end only).
  - Dependencies: MILESTONE-08, MILESTONE-09
  - Acceptance criteria:
    - [ ] FR-033, FR-046, FR-065..FR-067 pass
    - [ ] After `mc:end` the event is read-only in UI and RLS
    - [ ] A player never sees their result before reveal or timer end
  - Estimated effort: M

- **MILESTONE-11: Moderation & kill switch**
  - Scope: FR+EN wordlist filter shared client/server; admin hide/rename participant and team; hidden entities excluded from big-screen views but retained in records; `mc:kill_switch`.
  - Dependencies: MILESTONE-06, MILESTONE-09
  - Acceptance criteria:
    - [ ] FR-039, FR-069..FR-071 pass
    - [ ] Kill switch blanks all screens and player devices within 2 s and clears cleanly
  - Estimated effort: S

- **MILESTONE-12: Analytics dashboard**
  - Scope: `event_dashboard` RPC + admin UI — participant count, completion rate (present-steps basis), per-question correct/incorrect, average response time, final rankings; no email anywhere.
  - Dependencies: MILESTONE-10
  - Acceptance criteria:
    - [ ] FR-072..FR-074 pass
    - [ ] Completion rate matches a hand-calculated value for the fixture event including a late joiner
    - [ ] No email field is present in any dashboard response
  - Estimated effort: M

- **MILESTONE-13: GDPR flows & season capture**
  - Scope: `export_my_data`, `delete_my_account` (profile purge + score anonymisation), 90-day anonymous purge job, `season_year` derivation and `season_score` view, consent storage.
  - Dependencies: MILESTONE-02, MILESTONE-10
  - Acceptance criteria:
    - [ ] FR-075..FR-079, FR-081 pass
    - [ ] After account deletion, score rows remain but carry no identity link
    - [ ] The purge job removes an anonymous participant's data at 90 days in a time-travel test
  - Estimated effort: M

- **MILESTONE-14: Resilience & recovery hardening**
  - Scope: client auto-reconnect with backoff; player reload rejoin at current step with correct lock state and no duplicate answer; DO rehydrate path exercised; flush retry/backoff tuning.
  - Dependencies: MILESTONE-07, MILESTONE-08
  - Acceptance criteria:
    - [ ] FR-084..FR-086 pass
    - [ ] Mid-step player reload rejoins with correct locked/unlocked state
    - [ ] Simulated DO restart mid-event loses no committed answer
  - Estimated effort: M

- **MILESTONE-15: Scripted test harness & PoC validation run**
  - Scope: Node `partysocket` harness driving 10 clients (mix of anonymous/account, teamed/solo, one late joiner) through a fixed script over ≥3 steps (timed + untimed), asserting final individual and team scores against hand-calculated expectations; Playwright end-to-end of the human happy path; a written PoC validation report.
  - Dependencies: all prior milestones
  - Acceptance criteria:
    - [ ] FR-087 passes; the harness is repeatable in CI
    - [ ] G-1..G-5 demonstrably met and recorded in the report
    - [ ] Owner has the information to make the go/no-go decision (G-6)
  - Estimated effort: M

## 9. Open Questions & Assumptions

| ID | Question or Assumption | Owner | Status |
|---|---|---|---|
| Q-001 | Is the `eu` jurisdiction available for SQLite-backed Durable Objects on the Cloudflare **Workers Free** plan? If not, the PoC either accepts non-EU DO placement with test-only data or the commercial phase moves to Workers Paid earlier. Verify in MILESTONE-01. | Architect / Owner | Open — blocker for NFR-007 as stated; test-data-only fallback exists for the PoC |
| Q-002 | Domain name. The spec uses a placeholder host for `/e/:code` links and Supabase Auth emails. A domain must be registered before any test outside the owner's own devices. | Product owner | Open (REQ Q-13) |
| Q-003 | Image moderation and profile/team **photo** upload are deferred for the PoC (names only). Confirm photo upload is fully disabled rather than admin-review-only. | Product owner | Open — assumed disabled (REQ Q-4) |
| Q-004 | Pre-event on-demand Postgres backup cadence and acceptable RPO for the commercial phase. Not required for the PoC. | Architect / Owner | Deferred (REQ Q-10) |
| Q-005 | Cloudflare DPA signature, confirmation that `eu` jurisdiction covers all in-flight PII, and addition to the registre des traitements. Required before real public data is processed; not for the PoC. | Owner / DPO | Deferred (REQ Q-11) |
| Q-006 | Does the "Best Player of the Year" award constitute a French *jeu-concours* (règlement, deposit)? No season UI in the PoC, so non-blocking now. | Owner / DPO | Deferred (REQ Q-6) |
| Q-007 | Season detailed-data archival (FR-080) — confirm whether this lands in the PoC or the commercial phase. | Product owner | Open — assumed commercial phase |
| Q-008 | `mc:claim_control` policy in the PoC: assumed "any admin may claim at any time" (no heartbeat-timeout gate). Confirm this is acceptable for testing. | Product owner | Assumption — see A-6 |
| A-1 | Supabase **anonymous sign-in** is enabled and acceptable as the guest identity mechanism; anonymous sessions are never upgraded/linked to accounts (REQ §5.2). | Architect | Assumed |
| A-2 | One React app with three route trees (`/e/:code`, `/admin`, `/screen/:id`), one Vercel project — approved. | Owner | Confirmed |
| A-3 | The Durable Object writes to Postgres directly with a service-role Worker secret rather than via Edge Functions — approved. | Owner | Confirmed |
| A-4 | Vite SPA rather than Next.js — approved. | Owner | Confirmed |
| A-5 | The PoC runs on test data only; processor DPAs, DPO appointment, and Privacy/ToS drafting are commercial-phase prerequisites, but the consent/acceptance UI and the `eu` configuration are still built and exercised now. | Owner | Confirmed (REQ §11.23) |
| A-6 | Flow-control takeover in the PoC: any admin connection may claim the lock at any time; a heartbeat-timeout gate is a commercial-phase refinement. | Architect | Assumed pending Q-008 |
| A-7 | "Short video" waiting-screen media is capped small (≈10 MB) and plays on the big screen only; player devices show only a countdown/branding image. | Architect | From REQ §11.10 |
| A-8 | Timed-step fairness: server receipt time is the sole ordering basis; slower-connection players are disadvantaged and this is accepted. | Owner | Confirmed (REQ §11.9) |
| A-9 | Scoring, timer, and MCQ rules live in framework-agnostic TS modules with no Cloudflare dependency, to keep a raw-Durable-Objects fallback cheap (NFR-017). | Architect | Assumed |
| A-10 | Supabase free-tier project may pause between sessions; a keepalive GitHub Action cron plus a documented manual unpause covers the PoC. | Architect | From REQ §11.25 |

## 10. Glossary

| Term | Definition |
|---|---|
| **Event** | One live quiz session for one audience. Authored in `draft`, runs as `live`, then permanently `ended`/read-only. At most one `live` at a time in this iteration. |
| **Step** | One ordered position in an event; contains exactly one game. In this iteration every step is an MCQ. |
| **Game / `game_mcq`** | The polymorphic unit inside a step. Only the `mcq` type exists now; `step` stays generic so future real-time game types can be added without schema change. |
| **MCQ** | A single multiple-choice question: one prompt, several options, exactly one correct option; timed or untimed. |
| **Timed step** | `countdown_seconds > 0` and `timed = true`. Only the earliest correct answer (by server receipt time) scores. |
| **Untimed step** | `timed = false`. Every correct answer scores. A countdown may still run as a soft limit. |
| **Participant** | One person's presence in one event — the unit that answers and is ranked. Exactly one per (event, profile). |
| **Team** | An optional grouping of participants; unlimited size; open join; locked at event start; dissolved if it has fewer than two members at start. |
| **Team Captain** | The participant who created a team; may rename it; has no moderation power. |
| **Solo player** | A participant with no team; appears in the individual ranking only. |
| **Admin** | One of two pre-provisioned privileged accounts. Operates as **MC** (smartphone, holds the flow-control lock) and/or **Operator** (Chrome/Edge desktop, drives the big screen). |
| **Flow-control lock** | The single-holder right to issue `mc:*` commands for a live event, held by one admin connection and transferable via `mc:claim_control`. |
| **EventRoom / Durable Object (DO)** | The Cloudflare Durable Object, one per event, that holds authoritative live state, owns the timer, orders answer receipts, computes scores at step close, buffers to SQLite, and flushes to Postgres. Pinned to the `eu` jurisdiction. |
| **System of record** | Supabase Postgres (EU) — the durable, authoritative store for all persisted data. The DO is never the sole store of a committed result. |
| **Big-Screen Receiver** | A `/screen/:eventId` page opened by the Operator onto a secondary display via the Presentation API; renders only Operator-selected views. |
| **Presentation API** | The browser API (Chrome/Edge desktop) that lets the Operator's page drive a secondary display with its own content. |
| **PartyServer** | The `partyserver` library (Cloudflare) used to implement the EventRoom as a Durable Object with WebSocket fan-out. |
| **Season** | A calendar year, derived from an event's start date; used only to link account holders' per-event scores. No season-facing UI in this iteration. |
| **Proof of Concept (PoC)** | This iteration: zero-cost, free-tier, 10-connection, scripted-test-event validation of the synchronised flow and scoring, ahead of a go/no-go decision on the commercial phase. |
| **Commercial phase** | The deferred follow-on: paid plans, 500-concurrent scale, dress rehearsal, first paid show, processor DPAs, automated image moderation, MFA. |

---

*Produced by the Solution Architect from `REQUIREMENTS.md` v1.1. Ready for the OpenSpec implementation tool. If requirements change, update `REQUIREMENTS.md` and revise this file in place.*
