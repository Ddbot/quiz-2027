# REQUIREMENTS.md
## Quiz 2027 (working title) — Live Event Social Gaming Platform

**Version:** 1.1
**Prepared by:** Analyst Agent
**Date:** 2026-09-10 (rev. 2026-09-10 — reframed as a zero-cost Proof of Concept)
**Status:** Draft (PoC scope; Open Questions in Section 10 largely resolved)

> **PoC reframing (2026-09-10):** The owner has scoped v1 as a **proof of concept** with a **hard €0 / free-tier-only budget** and a **10-concurrent-connection** test target. The goal is to validate the concept and the synchronised-flow mechanism end-to-end. If validated, the project moves to paid plans and the original 500-concurrent, commercial-show targets in this document apply to the *next* phase. Functional scope (Section 4) is unchanged; non-functional targets, scale, budget, and success criteria are adjusted for the PoC (Sections 2.4, 6.3, 6.4, 8).

---

## 1. Executive Summary

Quiz 2027 is a custom, single-tenant web platform for running slick, on-brand live quiz games as part of a paid stage show at bars, large venues (e.g. pre-gig warm-ups), private functions, and conferences. The audience plays on their own smartphones (responsive website, no install) in optional teams of unlimited size or solo; one or more venue big screens act as a synchronised scoreboard driven via the Presentation API. An admin acts as on-stage **MC** (smartphone, flow control) and/or backstage **Operator** (Chrome/Edge computer, casting). The single most important capability is a reliable, synchronised live step flow — when the MC advances a step, every player device and every big screen updates in lockstep within 2 seconds. **v1 is a zero-cost proof of concept** validating this mechanism with up to 10 concurrent connections; it ships one game type (multiple-choice questions), a two-track scoring model (individual points + fixed awards to the winning team per step), a per-event analytics dashboard, and GDPR-compliant handling of player data on EU-only infrastructure. Commercial-scale hardening (500 concurrent, paid plans, dress rehearsal, first paid show) is the phase that follows a successful PoC.

---

## 2. Vision & Success Criteria

### 2.1 Problem Statement

The product is part of a live, professionally produced show sold commercially to clients and venues. Off-the-shelf tools (Kahoot, Slido, AhaSlides, QuizXpress) cannot deliver the required production quality: the visuals, motion, pacing, and branding must be first-class and fully controlled, because a failure or an off-brand moment happens live in front of a paying audience. Existing tools also do not provide the specific control model (dedicated MC vs Operator devices, Presentation API casting, a polymorphic "game container" that will later host real-time game types) or the team/scoring model required.

### 2.2 Core Domain Concepts

- **Event** — a single live session at one venue on one date. Exactly one active Event at a time in v1. Created days ahead through a form; editable up to the moment the MC presses **start**, then content is frozen for the duration.
- **Step** — one ordered entry in an Event's sequence. In v1 each Step contains exactly one **Game**.
- **Game** — a polymorphic "container". v1 implements one type only: **MCQ** (a single multiple-choice question). Future versions may add real-time competitive game types; the data model and interfaces must not preclude this, but no plugin framework is built in v1.
- **Team** — an optional grouping of players. Unlimited size, no minimum. The creator becomes the persisted **Team Captain**. Joining is completely open (no approval, no cap). Teams lock at Event start.
- **Season** — a calendar year. Account-holder scores are aggregated per season to drive an annual "Best Player of the Year" award.

### 2.3 Target Users

| Persona | Description |
|---|---|
| **Player (anonymous)** — primary | A member of the public at the event. Joins by scanning a QR code (or typing the short code) shown in the venue, enters a permanent display name, optionally joins/creates a team, plays on their own phone (mostly Safari/iOS and Android Chrome). Low tolerance for friction; may join late. |
| **Player (account holder)** — primary | As above, but creates a GDPR-compliant account (email + password + display name, optional profile photo). Motivated by event news and eligibility for the season award. Scores persist across events within a season. |
| **Admin — MC mode** — secondary | The product owner or one trained staff member. On a smartphone, faces the audience, holds **exclusive flow control** during a running event (start, advance step, stop/end). |
| **Admin — Operator mode** — secondary | The product owner or one trained staff member. On a Chrome/Edge desktop, uses the Presentation API to cast the big-screen scoreboard view to one or more mirrored screens. **Display/casting only during a running event** (no flow control) unless promoted to take over from a failed MC. |

Team size is 2–4 in the original brief but has been explicitly overridden to **unlimited** (see Section 4 and Section 11).

### 2.4 Success Metrics

**PoC phase (current scope):**

| Metric | Target |
|---|---|
| End-to-end synchronised flow | MC advances a step → all connected player devices + big-screen view reflect it within 2 s, with 10 concurrent connections |
| Full happy path works | Join (anon + account) → team → waiting screen → ≥3 MCQ steps (timed + untimed) → reveals → final podium, with no manual intervention |
| Scoring correctness | Individual and team scores match hand-calculated expected values for a scripted test event |
| Resilience basics | A player device reload mid-event rejoins at the current step with correct state; MC device reload resumes flow control |
| Cost | €0 — everything on free tiers |
| Decision | Owner can decide "proceed to paid/commercial phase" or "stop" based on the PoC |

**Deferred to the post-PoC commercial phase** (targets retained for continuity):

| Timeframe | Metric | Target |
|---|---|---|
| First paid show | Zero-incident show rate | 100% — no player-visible failure during a live show |
| Before first paid show | Dress-rehearsal event completed | 1 friendly-audience run |
| +12 months | Reliable event size | ~50 players per event |
| +12 months | Commercial validation | Client rebookings secured |
| +12 months | Proven headroom | Crash-tested to 500 concurrent players |
| +12 months | Volume | ~20 events; ~1,000 retained accounts |

---

## 3. User Roles & Permissions

| Role | Description | Key Capabilities | Restrictions |
|---|---|---|---|
| **Player (anonymous)** | Public participant, no account | Join via QR/short code; set permanent display name; create/join/leave a team pre-event; submit answers (explicit confirm button); view own + team score/ranking; edit own profile media pre/post as applicable | 16+ self-declared; cannot change display name; cannot change team after Event start; no admin views; data purged 90 days after event |
| **Player (account holder)** | Public participant with GDPR account | All anonymous capabilities; persistent identity across events; season score aggregation; eligible for annual award; receives event news (if consented); manage/delete account | Same in-event restrictions as anonymous; email never shown publicly or in dashboards |
| **Team Captain** | The player who created a team | All player capabilities; edit team profile (name, photo/media) | No power to remove members or moderate; if team has 1 member at Event start, team is dissolved and the member plays solo |
| **Admin (single role, two operating modes)** | Product owner or trained staff; accounts pre-created manually by owner | **Setup (either mode):** create/edit events, steps, MCQ content, timers, scoring; upload waiting-screen media; view live individual ranking; view live team ranking; access per-event analytics dashboard. **MC mode (smartphone):** exclusive flow control during a running event — start, advance step, stop/end event, panic/kill switch. **Operator mode (Chrome/Edge desktop):** cast big-screen view via Presentation API; curate what player-entered content appears on screen; can be promoted to flow control if the MC device fails. | No self-signup; no MFA in v1 (deferred to v2 — accepted risk); Operator has no flow control during a running event unless promoted; no manual score correction; no answer-key override mid/post event |

---

## 4. Functional Requirements

### 4.1 Must Have (v1)

- Responsive player website; opens from QR link with Event join code pre-filled; manual short-code entry as an alternative path to the same Event.
- Player onboarding: choose anonymous (permanent display name only) or account (email + password + display name; optional profile photo); mandatory "I am over 16" checkbox; separate unticked marketing-consent checkbox (account works without it); acceptance of Privacy Policy + Terms of Service.
- "Permanent username" warning screen (light-hearted tone) before the display name is committed.
- Team lobby: create a team (creator becomes Captain), join any visible team, leave/switch team — **all only before Event start**. After start, team membership is locked.
- Solo play supported (no team).
- Waiting screen: big screen shows admin-uploaded rich media (image or short video); player devices show only a countdown and/or lightweight branding/marketing image.
- Event authoring form (days ahead, editable until start): ordered list of steps; per MCQ step — question text, answer options, correct option, timed/untimed toggle, countdown seconds, points per correct answer (default 1), fixed points awarded to the winning team for that step.
- Live flow (MC only): start event, advance step, launch transition screen, stop = end event.
- Synchronised state: MC action propagates to all player devices and all big screens within **2 seconds**.
- MCQ gameplay: player selects an option and confirms with an explicit button; timer is a hard lock — on expiry all input is locked; the MC then manually launches a transition or the next step (no auto-advance).
- Scoring — individual track: 1 point per correct answer, accumulated across steps.
  - Untimed MCQ: every correct answer scores.
  - Timed MCQ: **only the single fastest correct answer scores** (ranked by server receipt time); all others score 0 for that step.
- Scoring — team track: per step, each team's score = **average of the per-step scores of only those members who submitted an answer**; the team with the highest average is the step winner and receives the step's fixed team-points award; ties share the same award; a team with zero submitting members is excluded from that step's ranking and awarded 0.
- Late joiners: a player may join after the Event has started; they begin at 0, can only score from the current step onward, **cannot join or create a team** (solo only).
- Live rankings (admin views): individual ranking and team ranking, both updating live.
- Big screen scoreboard: distinct from the player view; high-contrast design; all player-entered content (names, team names, photos) passes through the Operator before it is shown — nothing appears on screen automatically.
- End of event: explicit "end event" (also reached via "stop") locks all scores and triggers a final ranking reveal / podium for individuals and teams on the big screen; the Event becomes permanently read-only.
- Presentation API receiver page (the big-screen view) driven by the Operator's Chrome/Edge browser; supports one or more mirrored big screens showing identical content.
- MC/Operator takeover: if the MC device fails, the Operator device can be promoted to flow control and resume from the exact current step with all scores intact.
- Content moderation: automated FR+EN wordlist profanity filter on display names and team names; admin ability to hide or rename any player or team from the console. *(PoC: profile/team photo upload is disabled or admin-review-only; automated image moderation returns with the commercial phase.)*
- Per-event analytics dashboard: participant count, completion rate (answers submitted ÷ steps the player was present for), per-question correct/incorrect breakdown, average response time, final rankings. Email addresses never shown at row level.
- GDPR mechanics: consent capture, data export and account deletion for account holders, 90-day post-event purge for anonymous player data, season archival. *(PoC exercises the flows with test data.)*
- Error tracking (Sentry free tier).
- Season data capture: an account's per-event scores are linkable by calendar year. **No season-facing UI** in the PoC.
- Per-question feedback: a player sees their own result (correct/incorrect, points) only when the MC triggers the reveal step, or when the step timer ends.

### 4.2 Should Have (v1)

- Admin **panic / kill switch**: one control that instantly blanks all big screens and/or freezes the current game.
- Duplicate display names within one Event allowed, with automatic disambiguation (e.g. internal ID / suffix) so the admin and scoring can tell them apart.
- Graceful auto-reconnect for players after a brief network drop, resuming at the current step (no offline play, no answer queueing).
- A scripted test harness / simulated clients to drive the 10-connection PoC validation (grows into 500-concurrent load tooling in the commercial phase).

### 4.3 Out of Scope (v1)

- Native iOS/Android apps; PWA install.
- Any game type other than MCQ; any real-time competitive game.
- Multiple concurrent active events (data model must not preclude; feature not built).
- Multiple questions per game/step (exactly one question per MCQ game in v1).
- Pausing a running step (the original brief's "pause" is dropped; "stop" = end event).
- Manual score correction, answer-key override, or an admin audit log.
- Player-facing "report" button; player-to-player chat; player media/photo submissions as gameplay.
- Cross-event / season analytics dashboard (only per-event dashboard in v1).
- Sending marketing email (only consent capture ships; sending built later).
- Social login (Google/Apple); admin MFA (post-PoC).
- Sharing any data with clients, venues, or any third party.
- Merging or linking an anonymous participation to a later account.
- Native support for the Presentation API on Safari/Firefox for the Operator (Chrome/Edge only).
- **PoC-specific deferrals:** automated image moderation; profile/team photo upload (unless admin-review-only); any season-facing UI; paid infrastructure; verified 500-concurrent scale; dress rehearsal and first paid show; processor DPAs and DPO appointment (test data only in the PoC).

### 4.4 Feature Detail

#### 4.4.1 Synchronised Live Step Flow (the critical feature)

**User Story:** As the MC, I want every player phone and every big screen to move to the same step at the same time when I advance the flow, so that the show stays coherent in front of a paying audience.

**Acceptance Criteria:**
1. When the MC triggers "advance step", all connected player devices and all big-screen receivers reflect the new step within 2 seconds (verified at 10 concurrent connections for the PoC; 500 in the commercial phase).
2. Server holds the authoritative Event state (current step, step status, timer start time); clients reconcile to it on every update and on reconnect.
3. A player who reconnects mid-event is placed on the current step with correct locked/unlocked input state.
4. Timer expiry locks answer submission on all clients derived from the authoritative timer start; late submissions are rejected server-side.
5. Only the device currently holding flow control (MC, or promoted Operator) can issue flow commands; commands from any other admin device are rejected.

**Edge Cases:**
- MC device dies mid-step → Operator promoted → resumes from exact current step, scores intact.
- Big-screen receiver disconnects mid-reveal → on reconnect it renders the current authoritative state, not a replay.
- Network partition for a subset of players → those clients show a "reconnecting" state and catch up on the authoritative state when restored; they do not desync silently.
- Duplicate/rapid MC taps → idempotent step transitions; no double-advance.

#### 4.4.2 Player Onboarding & Team Lobby

**User Story:** As a member of the audience, I want to join the game in a few seconds from my phone and either play solo or with friends, so that I can start playing before the show moves on.

**Acceptance Criteria:**
1. Scanning the venue QR opens the responsive site with the Event code pre-filled; typing the short code reaches the same Event.
2. The player picks anonymous or account; anonymous requires only a display name; both require the 16+ checkbox and acceptance of Privacy Policy + ToS.
3. Before the display name is saved, a light-hearted warning screen states it is permanent.
4. Before Event start, the player can create a team (becoming Captain), join any visible team, or leave and switch; after start, all of this is disabled.
5. A player may choose no team and play solo.

**Edge Cases:**
- Player joins after Event start → solo only, starts at 0, scores only from the current step.
- Team has exactly 1 member at Event start → team dissolved, member becomes solo.
- Profanity in display/team name → rejected by filter with a retry prompt.
- Same display name as another player in the Event → allowed, disambiguated internally.

#### 4.4.3 MCQ Game & Two-Track Scoring

**User Story:** As a player, I want to answer the question on my phone and confirm it, and as the MC I want the correct scores computed automatically for individuals and teams.

**Acceptance Criteria:**
1. The MCQ step shows the question and options on player devices; the big screen shows what the Operator has selected to display.
2. The player selects one option and must press an explicit confirm button; the answer and its server receipt time are recorded.
3. Untimed: each correct answer earns 1 point. Timed: only the earliest correct answer (by server receipt time) earns 1 point.
4. Team per-step score = average of submitting members' per-step scores; highest average wins the step and receives the configured fixed team award; ties share it.
5. Individual and team cumulative rankings update in the admin views and are available for the big screen.

**Edge Cases:**
- Nobody answers a question → all players and all teams score 0 for that step.
- Nobody answers correctly in a timed MCQ → no individual point awarded; team averages computed from submitting members (all 0).
- A team member is disconnected for a step → excluded from that step's team average (only submitters count).
- Two correct answers with identical server receipt timestamps in a timed MCQ → treat as a tie; both score (document tolerance/precision of the timestamp).

#### 4.4.4 Big-Screen Presentation & Operator Curation

**User Story:** As the Operator, I want to cast a controlled scoreboard to the venue screens and decide what audience-visible content appears, so that nothing off-brand or offensive is shown.

**Acceptance Criteria:**
1. The Operator (Chrome/Edge desktop) starts a Presentation API session to one or more mirrored external displays.
2. The big-screen view is visually distinct from the player view and meets high-contrast requirements.
3. No player-entered name, team name, or photo appears on the big screen unless the Operator has explicitly promoted it.
4. The panic/kill switch (should-have) blanks all big screens and/or freezes the current game immediately.

**Edge Cases:**
- Operator device crashes → big screen goes dark; Operator reconnects (or a second admin device takes over Operator mode) and re-establishes the session; flow control is unaffected (still with the MC).
- Multiple big screens with different resolutions → identical content, responsive/high-contrast layout scales.

#### 4.4.5 Post-Event Analytics Dashboard

**User Story:** As an admin, I want per-event metrics after the show, so that I can improve future events and demonstrate value for rebookings.

**Acceptance Criteria:**
1. For a completed event, the dashboard shows: participant count, completion rate, per-question correct/incorrect breakdown, average response time, final individual and team rankings.
2. No player email addresses are shown at row level.
3. Available only to admins.

**Edge Cases:**
- Event with late joiners → completion rate definition documented (e.g. relative to steps the player was present for, or absolute).
- Very small event (1–2 players) → dashboard still renders without divide-by-zero errors.

---

## 5. Privacy & Safety Requirements

### 5.1 Identity Verification

No real-world identity or address verification. Players self-assert a display name only. Account holders verify an email address (standard email confirmation / magic link). Admin accounts are created manually by the product owner; there is no admin self-signup.

### 5.2 Anonymity Policy

Anonymous play is a first-class path: a player may participate with only a display name and no account. Anonymous participation is never linked to, merged with, or reconciled against any account, now or later. Account holders play under their display name; their email is never exposed to other players, to clients, on the big screen, or in analytics at row level. Display names and team names are the only ever-public identifiers, and only after passing the profanity filter and (for on-screen display) Operator curation.

### 5.3 Location Data Handling

The product is not location-aware. No player device geolocation is requested or stored. The only location data is the free-text venue/event description entered by the admin during event setup (event metadata, not personal data).

| Data Point | Stored? | Precision | Accessible To |
|---|---|---|---|
| Player device GPS / geolocation | No | — | — |
| Player home/postal address | No | — | — |
| Venue name / event location | Yes (event metadata) | Free text, venue-level | Admins only |
| Player IP / device identifier | Minimal — only what is strictly necessary to maintain the session across a reconnect | Session-scoped | System only; not surfaced in any UI |

### 5.4 Data Residency & Legal Framework

- **Applicable law:** EU GDPR (French company, French DPO). RGPD terminology; CNIL is the supervisory authority.
- **Data residency:** All personal data must be stored in **EU data centres**. Supabase's standard EU region (AWS EU, e.g. Ireland or Frankfurt) is acceptable — data specifically in France is **not** required.
- **Sub-processors:** Every third-party service that touches personal data (email provider, image-moderation provider, error tracking, hosting, real-time/edge provider) must be covered by a Data Processing Agreement and should be EU-hosted or provide adequate transfer safeguards. Image-moderation provider choice must be assessed for where uploaded images are processed (see Open Questions). If a Cloudflare-based real-time layer (PartyKit / PartyServer on Durable Objects) is adopted, the Durable Objects must use the **`eu` jurisdiction** restriction and a Cloudflare DPA must be in place (see Open Question 11).
- **DPO:** A Data Protection Officer will be appointed by the product owner.
- **Policies:** A Privacy Policy and Terms of Service must be drafted (legal work, outside the Architect's scope) and presented for acceptance at join time.
- **Records:** A GDPR record of processing activities (registre des traitements) should be maintained by the owner/DPO.

### 5.5 Vulnerable User Protections

- Minimum age 16 (Section 5.7).
- No collection of sensitive categories of data; minimal data by design (email + display name + optional photo for accounts; display name only for anonymous).
- Uploaded images have EXIF/metadata stripped on ingest (removes embedded GPS and device data).
- No public directory of players; a player's participation is visible only within their event, by display name.
- Email addresses are internal-only and never rendered in player-facing or client-facing surfaces.
- All audience-visible content is gated by the Operator, preventing a player from broadcasting harmful content to the room via a name or photo.

### 5.6 Content Moderation

- **Model:** Top-down only. No community or player-facing moderation, no report button in v1.
- **Automated:** FR+EN wordlist profanity filter on display names and team names at entry; automated image moderation on every profile and team photo upload (reject on failure, prompt for another).
- **Manual:** Any admin can hide or rename any player or team from the MC/Operator console. Nothing player-entered reaches the big screen without explicit Operator promotion.
- **Serious incidents (harassment, threats, safeguarding):** handled operationally by the on-site staff (2 people) and the venue; the platform's contribution is the kill switch, the ability to hide/rename offenders, and (post-event) the ability to identify an account holder to the DPO if legally required. No in-app escalation workflow in v1.
- **Response expectation:** because everything is gated live by the Operator, the effective on-screen moderation latency is immediate (nothing appears unless promoted).

### 5.7 Minor Users

- Minimum age: **16** (aligned with the French GDPR digital-consent threshold).
- Enforcement: a mandatory "I am over 16 years old" checkbox at join. No date of birth is collected or stored. Self-declared; not further verified in v1.

### 5.8 Data Retention & Deletion

| Data type | Retention | On deletion / expiry |
|---|---|---|
| Anonymous player data (display name, answers, per-step and total scores) | 90 days after the event ends (dispute-resolution window) | Hard purge |
| Account holder — profile (email, password hash, display name, photo, consent flags) | Life of the account | On account deletion: profile fully purged |
| Account holder — historical scores / rankings | Retained beyond account deletion | Anonymised (unlinked from identity) so historical and season leaderboards remain intact |
| Season detailed data | To end of the calendar-year season | Archived at season close |
| Waiting-screen media (admin-uploaded) | Life of the event record | Removed with the event or on admin action |
| Session/reconnect identifiers | Session lifetime | Expire with the session |
| Error-tracking data | Provider default / minimised | Per provider retention policy |

Account holders can export their data and delete their account (GDPR rights: access, rectification limited by the permanent-display-name rule, erasure, portability, objection to marketing).

### 5.9 Third-Party Data Sharing

No user data — raw, aggregated, or anonymised — is shared with or sold to any third party. Paying clients receive nothing in v1. Venues, sponsors, advertisers, and researchers receive nothing. Player data is used strictly by the product owner's company for: running the game, computing the season award and contacting its winner, and (once built) sending event news to consented account holders. Third-party services are used only as data processors under DPA (hosting, email, image moderation, error tracking).

---

## 6. Tech Stack & Platform Constraints

### 6.1 Platform Targets

| Platform | Priority | Notes |
|---|---|---|
| Web — player (responsive site) | P0 | No install, no PWA. Opened from QR link. Must fully support **Safari/iOS** and Android Chrome. Large tap targets; WCAG 2.2 AA. |
| Web — admin MC (smartphone browser) | P0 | Flow control UI. Modern mobile browsers. |
| Web — admin Operator (desktop) | P0 | **Chrome or Edge desktop only** — Presentation API is not supported in Safari/Firefox. |
| Web — big-screen receiver page | P0 | Presentation API receiver; high-contrast; one or more mirrored screens, identical content. |
| Native iOS / Android | Out of scope | Not in v1. |
| PWA install | Out of scope | Not in v1. |

### 6.2 Infrastructure

| Component | Constraint / Preference | Rationale |
|---|---|---|
| Frontend framework | React + TypeScript | Owner's choice. |
| UI components | shadcn/ui | Owner's choice; enables a bespoke, on-brand look. |
| Frontend hosting | Vercel | Owner's choice. |
| Backend platform | Supabase (Postgres, Auth, Storage), **Free tier**, standard **EU region** | Owner's choice; EU residency satisfied. Free-tier project auto-pauses after 7 days idle — mitigate with a keepalive ping (cron / GitHub Action) or manual unpause before each test. |
| Database | Relational — Supabase Postgres | Owner's choice; suits scoring, rankings, event/step modelling. |
| Auth | Supabase Auth, email + password. Admin accounts pre-provisioned manually. No social login. No MFA in PoC (deferred). | Owner's choice. |
| Real-time transport | Target latency **< 2 s** MC-action → clients. **Confirmed: self-hosted PartyServer on the owner's own Cloudflare account** — one SQLite-backed **Durable Object per Event**, pinned to the **`eu` jurisdiction**, on the **Cloudflare Workers Free plan** ($0; free plan includes SQLite Durable Objects, ~3M req/mo and 390k GB-s/mo, no storage billing). Supabase Postgres remains the **system of record**; the DO holds only in-flight state and flushes to Postgres each step. Scaling to commercial volume is a switch to the $5 Workers Paid plan — no re-architecture. | Lockstep flow is the critical feature; a per-Event authoritative actor matches it directly and anticipates future real-time game types. |
| Real-time / backend language | **TypeScript** — PartyServer runs on the Cloudflare Workers runtime (JS/WASM only). Single language front-to-back. Owner's Go learning goal deferred to post-PoC. | Risk management for a solo dev. |
| Maps / geolocation | None. | Product is not location-aware. |
| Media storage / CDN | Supabase Storage (Free tier) + its CDN. Waiting-screen rich media served to the big screen only. | Cost control. |
| CDN (static frontend) | Vercel Hobby (PoC) → Vercel Pro before any paid event (Hobby forbids commercial use). | Cost control. |
| Error tracking / monitoring | Sentry free tier. | Catch failures during PoC test runs. |
| Email | Supabase Auth built-in email for the PoC (verification/reset only; low volume). Dedicated provider deferred with marketing send. | €0 for PoC. |
| Image moderation | **Deferred for the PoC** — profile/team photo upload is either disabled or admin-review-only at 10-user PoC scale. Automated moderation returns with the commercial phase (Open Question 4). | €0; low risk at PoC scale with a known test audience. |
| Profanity filter | Library-based FR+EN wordlist. No managed service. | Sufficient for v1. |
| QR / short code | Generated in-app per event. | — |

### 6.3 Scale Assumptions

| Phase | Concurrent connections (peak, single event) | Active events | Retained accounts |
|---|---|---|---|
| **PoC (current)** | **10** (test target; design must not actively prevent more but is not optimised or verified beyond 10) | 1 at a time | Handful of test accounts |
| Commercial phase (post-PoC) | 500 (crash-tested); typical ~50 | 1 at a time | ~1,000 at +12 months |

"Connections" = player devices + admin devices (MC, Operator) + big-screen receiver(s), all counted against the same per-Event Durable Object.

Future (must not be precluded by the data model): multiple concurrent active events, audiences beyond 500, additional real-time game types.

### 6.4 Budget Constraints

**Hard constraint: €0 / month.** Everything must run on free tiers for the PoC.

| Service | Plan | PoC cost |
|---|---|---|
| Vercel | Hobby | €0 (must move to Pro ~$20/mo before any commercial use) |
| Supabase | Free | €0 (auto-pause after 7 days idle — keepalive or manual unpause) |
| Cloudflare Workers + SQLite Durable Objects | Free | €0 (within ~3M req/mo, 390k GB-s/mo; no storage billing on free plan) |
| Sentry | Developer (free) | €0 |
| Domain | — | placeholder for PoC; ~€10/yr when registered |

If the PoC is validated, the commercial phase moves to paid plans (indicative ~$50/mo: Supabase Pro + Vercel Pro + Cloudflare Workers Paid). No cost-per-user target.

### 6.5 Accessibility

- **Player app:** WCAG 2.2 AA. Large tap targets (comfortably usable one-handed in a dark, crowded venue). Sufficient contrast; no reliance on colour alone for correctness feedback; keyboard/screen-reader operable for the core answer flow.
- **Big screen:** high-contrast design tuned for large-format, variable-distance viewing in low light.
- French **RGAA** is the local accessibility framework; AA is the working target. Formal RGAA audit not required for v1 but the AA baseline keeps that path open.

### 6.6 Internationalisation

- Languages at launch: **French and English**.
- The MC selects the language **per event**; all player-facing and big-screen text for that event renders in the chosen language.
- No RTL languages in v1.
- Locale-aware date/number formatting for FR and EN.
- Admin authoring/console UI: **French only** (confirmed). Only the player-facing and big-screen surfaces are bilingual FR/EN.

---

## 7. Integrations & External Dependencies

| Integration | Purpose | Required at Launch? | Notes |
|---|---|---|---|
| Supabase (Postgres, Auth, Storage) | System of record; auth; media | Yes | Free tier, EU region. DPA on file for the commercial phase. |
| Vercel | Frontend hosting / CDN | Yes | Hobby for PoC; Pro before commercial use. |
| Cloudflare Workers + SQLite Durable Objects (self-hosted PartyServer) | Authoritative live game state per Event; WebSocket fan-out to players + big screens | Yes (confirmed) | Owner's **own Cloudflare account**, Workers **Free** plan. Durable Objects **must** use the `eu` jurisdiction. Cloudflare DPA before the commercial phase (OQ11). DO holds only in-flight state; results flushed to Supabase Postgres each step. |
| Supabase Auth built-in email | Email verification, password reset | Yes | €0, low volume. Dedicated provider deferred (OQ5). |
| Marketing email sending | Event news to consented accounts | No (post-PoC) | Only consent capture + unsubscribe intent stored. |
| Image-moderation service | Screen uploaded profile/team photos | **No (deferred for PoC)** | Photo upload disabled or admin-review-only at PoC scale. Returns with the commercial phase (OQ4). |
| Profanity wordlist library (FR+EN) | Filter display/team names | Yes | Bundled library, no external calls. |
| Error tracking | Detect failures during test runs | Yes | Sentry free tier; scrub PII. |
| QR code generation | Event join codes | Yes | In-app; no external service. |
| Social login (Google/Apple) | — | No | Out of scope. |
| Payment processing | — | No | Events sold offline; no in-app payments. |
| Government / open-data APIs | — | No | Not applicable. |
| Push notifications (SMS/web push) | — | No | Not in scope. |

---

## 8. Non-Functional Requirements

| Category | Requirement | PoC measurement | Commercial-phase target |
|---|---|---|---|
| Real-time latency | MC flow action → all player devices and big screens reflect new state | < 2 s with 10 concurrent connections | < 2 s at 500 |
| Concurrency | Connections against one Event's Durable Object | 10 verified | 500 without degradation |
| Player app load | First interaction ready on a mid-range phone | < 3 s on 4G (best effort) | < 3 s on 4G, verified |
| Reliability | Player-visible failures during a scripted test event | 0 across the test script | 0 during live shows |
| Availability | Platform available during a test/event window | Manual unpause of Supabase before a session is acceptable | Effective 100% during events |
| Recovery | MC device reload/failure | Reload resumes flow control from current step; promoted Operator can take over; no score loss | same |
| Recovery | Player device reload | Rejoins current step with correct locked/unlocked state | same |
| Recovery | Operator/big-screen reload | Re-establishes the session and renders current authoritative state | same |
| Data durability | Scores and answers | Flushed to Postgres at each step boundary; recoverable to last committed step | same + pre-event on-demand backup |
| Security | Transport | HTTPS/WSS everywhere; DO verifies Supabase JWT on connect; Supabase RLS separates player / account / admin | same |
| Security | Admin access | Pre-provisioned accounts only; MFA deferred | + MFA |
| Privacy | PII exposure | Email never in player-facing UI, big screen, or row-level analytics | same |
| Accessibility | Player app | WCAG 2.2 AA (large tap targets; no colour-only feedback) | same + formal check |
| Moderation | On-screen content | Nothing player-entered reaches the big screen without explicit Operator promotion; FR+EN wordlist filter on names | + automated image moderation |
| Observability | Monitoring | Sentry captures errors during test runs; key flow events logged | + uptime alerting |
| Load testing | Pre-launch | Simulated 500-player event passes before the first commercial show |

---

## 9. Delivery Constraints

### 9.1 Timeline

| Milestone | Date |
|---|---|
| Requirements complete | 2026-09-10 |
| SPEC.md | To follow (Architect) |
| PoC build (solo) | From 2026-09 |
| PoC validation — scripted 10-connection test event | Target 2026-12 |
| Go/no-go decision on the commercial phase | After PoC validation |
| *(commercial phase, if green-lit)* dress rehearsal → first paid show → 500-concurrent load test | Post-PoC, dates TBD |

### 9.2 Team

- **Engineering:** 1 person (the product owner), solo.
- **On-site per event:** 2 people (owner + 1 trained staff), covering MC and Operator roles.
- **Ecosystem:** TypeScript/React front to back; Supabase Postgres (system of record); real-time via self-hosted PartyServer on the owner's own Cloudflare account (Workers Free + SQLite Durable Objects, `eu` jurisdiction). Owner's Go learning goal deferred to post-PoC.
- **Legal:** DPO to be appointed and processor DPAs (Supabase, Vercel, Cloudflare) put on file **before the commercial phase**; not blocking for the PoC, which uses test data only.

### 9.3 Regulatory & Legal

- EU/French GDPR (RGPD); CNIL supervisory authority; registre des traitements; DPAs with all processors; EU data residency.
- French accessibility framework RGAA (AA baseline targeted, no formal audit in v1).
- The annual "Best Player of the Year" award may constitute a *jeu-concours* under French law (potential requirement for a published règlement, and historically an huissier deposit) — to be validated by the owner/DPO before the first season closes. Non-blocking for the Architect.
- No other licensing, partnership, or compliance obligations identified.

---

## 10. Open Questions

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | Real-time mechanism. | Owner + Architect | **Resolved** — self-hosted PartyServer on the owner's own Cloudflare account, Workers Free plan, one SQLite Durable Object per Event, `eu` jurisdiction. Supabase Postgres is the system of record. |
| 2 | Backend/real-time language; owner's Go interest. | Product owner | **Resolved** — TypeScript only (Workers runtime). Go deferred to post-PoC. |
| 3 | Budget. | Product owner | **Resolved** — €0 / free-tier only for the PoC. Paid plans reconsidered only if the PoC is green-lit. |
| 4 | Image-moderation provider and its data-processing location. | Architect + DPO | **Deferred** — photo upload is disabled or admin-review-only in the PoC; revisit for the commercial phase. |
| 5 | Transactional email provider. | Architect | **Resolved for PoC** — Supabase Auth built-in email (verification/reset only). Dedicated provider chosen with marketing send, post-PoC. |
| 6 | Does the "Best Player of the Year" award trigger French *jeu-concours* obligations? | Product owner / DPO | Open — no season-facing feature in the PoC, so not blocking; resolve before the first real season closes. |
| 7 | "Completion rate" definition in the dashboard. | Product owner | **Resolved** — answers submitted ÷ (steps the player was present for); late joiners counted only from their join step. |
| 8 | Admin console UI language. | Product owner | **Resolved** — French only. Player + big-screen surfaces are FR/EN. |
| 9 | "Fastest correct answer" timing basis and tie handling. | Product owner + Architect | **Resolved** — server receipt time; simultaneous timestamps at millisecond precision tie and all such answers score. Accepted that players on slow connections are disadvantaged. |
| 10 | Backup cadence around events. | Architect + owner | Open (commercial phase) — PoC relies on Supabase Free automated backups + the per-step Postgres flush; pre-event on-demand backup to be added for paid shows. |
| 11 | Cloudflare DPA + confirm `eu` jurisdiction covers all in-flight PII + add to registre des traitements. | Product owner / DPO | Open (commercial phase) — PoC uses test data only; must be closed before real public data is processed. |
| 12 | PartyServer longevity; fallback to raw Durable Objects. | Architect | **Accepted as risk** — build on PartyServer self-hosted; keep game rules in portable TS modules so a drop to raw DO is a contained change. |
| 13 | Domain name. | Product owner | Open — placeholder used in the spec; register before external testing so QR links and auth emails have a stable host. |
| 14 | Per-question feedback timing on the player device. | Product owner | **Resolved** — a player sees their result only when the MC triggers the reveal, or when the step timer ends. |
| 15 | Season UI scope in the PoC. | Product owner | **Resolved** — data capture only (account → per-event scores, linkable by calendar year); no season-facing UI anywhere in the PoC. |

---

## 11. Assumptions

The following assumptions have been made and must be validated:

1. The original brief's "teams of 2 to 4 people" is **superseded** by the owner's later decisions: teams have **no minimum and no maximum size**, and joining a team is **optional** (solo play allowed). *(Explicitly confirmed in conversation.)*
2. The original brief's individual scoring ("each correct answer gives 1 point") holds for **untimed** MCQ; for **timed** MCQ, only the single fastest correct answer scores. Team standing is driven by **fixed per-step awards to the step-winning team**, not by summing raw answer points. *(Confirmed.)*
3. The QR code opens the responsive player site with the Event join code pre-filled; the **short code** is the manually typeable equivalent that resolves to the same Event. There is exactly **one join code/QR per event**.
4. "Pause" from the original brief is **removed** in v1; the MC's "stop" is equivalent to "end the whole event".
5. A running step, once launched, **cannot be paused or rewound**; the MC either lets the timer lock it or moves to a transition/next step.
6. Anonymous participations are **never** linked to accounts, and a player playing anonymously at one event then creating an account for another is treated as two unrelated identities.
7. Team per-step average excludes non-submitting members; a team where **no** member submitted is excluded from that step's ranking and scored 0.
8. Season assignment is by the Event's **start date** (an event spanning midnight New Year counts toward the season its start date falls in).
9. Duplicate display names within an event are permitted and disambiguated internally (exact mechanism — suffix, hidden ID — left to the Architect).
10. Waiting-screen rich media (image/short video) is shown on the **big screen only**; player devices show a countdown and/or a lightweight branding image, keeping egress low.
11. No admin audit log and no manual score correction/answer-key override in v1 — accepted by the owner as out of scope.
12. Admin MFA is deferred to v2 — accepted by the owner as a risk, mitigated by manual account provisioning, a strong password policy, and only 2 admin users.
13. The Operator uses a **Chrome or Edge desktop browser**; this constraint is acceptable to the owner and can be relied on.
14. Uploaded images have EXIF/metadata stripped on ingest as a standard privacy measure.
15. Supabase's standard AWS EU region satisfies the "EU-only data centres" requirement; data need not be physically in France.
16. The system runs **one active event at a time** in v1; the schema should carry an event scope on all event-bound data so multiple concurrent events can be enabled later without migration.
17. The Architect will produce load-testing tooling or guidance to validate the 500-concurrent target before the first commercial event.
18. Legal deliverables (Privacy Policy, Terms of Service, jeu-concours règlement) are produced outside the engineering track and are not the Architect's responsibility, but their acceptance points in the product (join flow) are in scope.
19. Real-time layer (confirmed): **one Durable Object per Event**, created in the Cloudflare `eu` jurisdiction, holding only in-flight state (current step, authoritative timer start, connection/role registry, live tallies). It is **not** the system of record — every answer and score is flushed transactionally to Supabase Postgres at each step boundary and at event end, so the DO can be lost or replaced without data loss (satisfies the "recoverable to last committed step" durability NFR).
20. The real-time server authenticates WebSocket connections by verifying the Supabase-issued JWT (via Supabase JWKS), so player/admin identity and role are established without a second credential store.
21. PartyServer is deployed to the **owner's own Cloudflare account** via wrangler, with its own deploy pipeline separate from the Vercel frontend — accepted as a third platform in the stack (Vercel + Supabase + Cloudflare) in exchange for a purpose-built fit for the critical feature.
22. 500 concurrent WebSocket connections in a single Durable Object is within Cloudflare's per-object limits; WebSocket Hibernation is used to keep idle cost low. (PoC verifies only 10.)
23. **PoC operating model:** the whole PoC runs on free tiers (Vercel Hobby, Supabase Free, Cloudflare Workers Free). Test data only — no real public participants, so processor DPAs, the DPO appointment, and the privacy-policy/ToS drafting are prerequisites for the *commercial* phase, not the PoC. The `eu` jurisdiction is still used from day one so the PoC exercises the real configuration.
24. **PoC validation is a scripted test event**, not a public show: a known set of ≤10 devices/simulated clients runs a fixed script (join, team, ≥3 MCQ steps mixing timed/untimed, reveals, podium) and the results are checked against hand-calculated expected scores.
25. The Supabase Free project may be **paused between test sessions**; the owner unpauses it (or a keepalive cron holds it open) before each run. Acceptable for the PoC; not acceptable for the commercial phase.
26. No domain is registered yet; the spec uses a placeholder host. Auth emails and QR links need a stable domain before any testing outside the owner's own devices.

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Event** | One live game session at one venue on one date. One active at a time in v1. Editable until the MC presses start, then frozen. |
| **Step** | One ordered position in an Event's sequence; contains exactly one Game in v1. |
| **Game** | A polymorphic container for a playable activity. v1 implements only the **MCQ** type. Future versions may add real-time competitive types. |
| **MCQ** | Multiple-choice question game: exactly one question, a set of options, one correct option; timed or untimed. |
| **Timed game** | Countdown matters: only the single fastest correct answer (by server receipt time) scores. Timer is a hard input lock on expiry. |
| **Untimed game** | Countdown does not affect scoring; every correct answer scores. May still carry a timer as a soft guide (0 = none). |
| **Team** | Optional player grouping; unlimited size; open join; locked at Event start; dissolved if only 1 member remains at start. |
| **Team Captain** | The player who created the team; a persisted role; can edit the team profile; has no moderation powers. |
| **Solo player** | A player in no team; appears in the individual ranking only. |
| **MC** | Admin operating mode: on a smartphone, audience-facing, holds exclusive flow control during a running event. |
| **Operator** | Admin operating mode: on a Chrome/Edge desktop, casts the big-screen view via the Presentation API; display-only during a running event unless promoted to take over from a failed MC. |
| **Admin** | The single privileged role (2 pre-provisioned accounts). "MC" and "Operator" are contextual modes of this role, not separate permission sets. |
| **Big screen** | Venue display(s) showing the scoreboard/presentation view; a Presentation API receiver page driven by the Operator; multiple screens show identical content. |
| **Panic / kill switch** | An admin control that instantly blanks all big screens and/or freezes the current game. |
| **Individual ranking** | Cumulative per-player points across all steps (1 per correct answer; timed steps award only the fastest). |
| **Team ranking** | Cumulative fixed awards won by each team for being the step-winner (highest average of submitting members' per-step scores; ties share the award). |
| **Season** | A calendar year; the aggregation window for the annual "Best Player of the Year" account award. |
| **Waiting screen** | Pre-start state: rich media on the big screen; countdown/branding only on player devices. |
| **Late joiner** | A player who joins after Event start: begins at 0, scores only from the current step onward, solo only. |
| **Presentation API** | Browser API (Chrome/Edge) letting the Operator's page drive a secondary display with its own content. |
| **PartyKit / PartyServer** | Framework (now under the `cloudflare/` org) for room-scoped stateful real-time servers. "PartyServer" is the core library layered over Cloudflare Durable Objects. Proposed as the real-time mechanism: one server instance ("party") per Event. |
| **Durable Object (DO)** | Cloudflare's single-instance, single-threaded stateful compute primitive with in-memory + persistent storage and WebSocket support. Can be pinned to the `eu` jurisdiction for GDPR data residency. Backs each PartyServer instance. |
| **System of record** | Supabase Postgres (EU). The authoritative, durable store for all events, answers, scores, and accounts. The real-time DO holds only transient in-flight state and flushes to the system of record at each step boundary. |

---

*This document was produced by the Analyst Agent and is intended as the sole input to the Architect Agent. Do not proceed to architecture or planning until all Open Questions in Section 10 are resolved or explicitly accepted as risks.*
