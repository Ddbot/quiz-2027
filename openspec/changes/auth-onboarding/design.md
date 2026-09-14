## Context

MILESTONE-02 left `apps/web` with no Supabase client at all — `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` have been in Vercel and the bundle's env since MILESTONE-01, but nothing reads them yet. It also left `participant` with **no insert policy for any non-admin role** — by design, the only sanctioned path to create one is the `join_event` RPC that SPEC.md §7.4.1 already specifies the contract for. This change builds both sides: the RPC, and the UI flow in front of it.

See `proposal.md` — Why / What Changes. Requirements are `specs/onboarding/spec.md` (new), `specs/data-model/spec.md` (adds `join_event`), `specs/platform-foundation/spec.md` (player route is no longer a placeholder).

## Goals / Non-Goals

**Goals:**
- A player can go from a join link to a `participant` row, anonymous or account, through the real UI.
- `join_event` is idempotent, profanity-checked, and is the only way a `participant` row gets created by a non-admin.
- Account creation genuinely requires email verification (FR-003) — not just a UI checkbox with nothing behind it.
- Onboarding UI text respects `event.language` (fr/en), matching the project's standing FR/EN convention for player-facing surfaces.

**Non-Goals:**
- Team creation/joining/lobby (FR-012+, a later milestone) — this change stops once the player has a `participant`.
- The admin console (MILESTONE-04).
- Duplicate-display-name disambiguation (FR-010) — nothing yet displays or scores by name, so there's nothing to disambiguate against.
- Photo upload — explicitly out of scope for the PoC.
- A general-purpose i18n framework — see D5.

## Decisions

### D1 — `join_event` is a `SECURITY DEFINER` Postgres function, matching SPEC.md §7.4.1's RPC contract

`join_event(p_join_code text, p_display_name text)` resolves the event by join code, rejects if not found (`invalid_code`) or `status = 'ended'` (`event_not_joinable`), rejects if the display name matches the profanity wordlist (`profanity`), then inserts `participant` (or returns the existing one on the `(event_id, profile_id)` unique constraint — MILESTONE-02 already has it) and returns `{ participant, event }`. `draft` and `live` events are both joinable — `draft` covers the pre-show window where players arrive via QR and wait; only `ended` blocks new joins (REQUIREMENTS.md §4.4.2's late-joiner edge case: joining while `live` is expected and normal). Errors are raised as Postgres exceptions with a recognizable `SQLSTATE`/message so the RPC's HTTP response carries the right `{error: "..."}` shape SPEC.md specifies. `SECURITY DEFINER` is required because the caller (`authenticated` role) has no `INSERT` policy on `participant`, by design (data-model-rls's D-series decisions) — this function is the deliberate, audited exception, mirroring how `app_promote_admin` is the exception for `is_admin`.

### D2 — Profanity check is a Postgres wordlist table + function, not a client-side or Edge Function check

A `profanity_word (word text, language text)` table, seeded via migration with a starter FR+EN list, and `is_profane(text) returns boolean` (case-insensitive containment check). `join_event` calls it server-side — the authoritative check SPEC.md's contract requires (`400 profanity`). Rationale: FR-069 literally specifies "wordlist profanity filter," which a small seeded table satisfies directly; doing this in Postgres avoids a new runtime (an Edge Function) for a project already minimizing moving parts, and keeps the check enforceable however `participant`/`team` names are ever written, not just from this one UI. A client-side pre-check is deliberately *not* added — it would duplicate the wordlist and could drift from the server's; the retry-prompt UX (FR-069) reacts to the RPC's `400 profanity`, which is already fast (same round trip as the join itself). Alternative (call out to a moderation API/Edge Function) rejected: unnecessary infra and cost for a wordlist-level check the spec explicitly describes as sufficient.

### D3 — Email confirmation is enabled; anonymous sign-in is unaffected

`supabase/config.toml`'s `enable_confirmations` flips to `true` (was `false` since MILESTONE-01/02). With confirmations on, Supabase's `signUp()` returns **no session** until the email is verified — this is GoTrue's actual behavior, not a UI-only gate — so account creation shows a "check your email" interstitial; clicking the emailed link is what produces a usable session, at which point `join_event` can run. Anonymous sign-in (`signInAnonymously()`) is a completely separate Auth method and is unaffected — it stays the instant path REQUIREMENTS.md §4.4.2 AC1 wants ("join in a few seconds"). Production must also flip this in the Supabase dashboard (Authentication → Providers → Email); local `config.toml` only governs `supabase start`.

**Risk:** Supabase's default (no custom SMTP) email sending is rate-limited (documented ~2–4/hour on the Free plan) — fine for solo local dev and for CI (which never leaves the local stack — Mailpit is a catcher, not real delivery, and isn't rate-limited). A real scripted test event with several people creating *accounts* simultaneously could hit that production limit. Mitigation for this PoC: the anonymous path has no such limit and is the expected fast path for most of the audience; if the test event needs more simultaneous account signups than the default allows, configuring a custom SMTP provider is a config change, not a code change, and can be decided closer to the actual test date rather than now.

### D4 — Testing the confirmation flow without a browser, extending `tools/db`'s existing approach

Local Supabase's Mailpit exposes an HTTP API (`GET /api/v1/messages` on `MAILPIT_URL`) for whatever it's caught. A new `tools/db` helper signs a test account up, fetches its confirmation email from Mailpit, extracts the verification link, and follows it via a plain HTTP request — producing a real confirmed session the same way a player's email client would, without needing a browser or Playwright for this layer. This mirrors how the RLS suite already tests through the real HTTP path rather than mocking it. Full browser-level E2E (Playwright, already in the approved stack) is left for whichever later milestone first needs to assert real rendered UI end-to-end; this milestone's UI gets component-level tests (Testing Library, mocking `supabase-js`) plus this RPC/Auth-level suite for the server-authoritative behavior.

### D5 — Onboarding UI text is FR/EN via a small local dictionary, not a full i18n framework

The project convention ("player + big-screen surfaces are FR/EN per event") applies here — the event already carries `language`. Rather than adding an i18n library (`react-i18next` et al.), onboarding's own copy lives in a small `{ fr: {...}, en: {...} }` dictionary local to the feature, selected by `event.language`. This satisfies the convention at the scope this milestone actually needs (one flow's worth of strings) without committing the whole app to a particular i18n framework before a second FR/EN surface (the big screen, later) exists to justify one.

### D6 — A public `event_public_summary` view fills a real gap MILESTONE-02's RLS left

Discovered implementing task 4.1: SPEC.md §7.4.1 calls `GET /rest/v1/event?join_code=eq.{code}` **public**, but MILESTONE-02's RLS on `event` only allows reads to admins or existing participants — there was no path for the genuinely unauthenticated request a player makes *before* choosing an identity. Fix: `event_public_summary`, a plain view (no `security_invoker` — it deliberately runs as its owner, not the caller, which is what lets it read past `event`'s RLS) exposing only `id, join_code, title, language, status, venue_label`, with `SELECT` granted directly to `anon`. This is the standard Postgres pattern for carving a public slice out of an RLS-protected table without loosening the base table itself. `draft` events are included (matches D1 — a draft event is joinable, so a player must be able to resolve one pre-show), `event.created_by`, `waiting_media_path`, `waiting_countdown_target`, and `current_step_id` are not exposed.

**Trade-off:** the view's grant isn't itself scoped to a single join code — a client that queried it without a `?join_code=eq.{code}` filter could list every event's public-safe fields (title, code, status), not just the one it asked about. `SELECT`s through PostgREST always evaluate against the full grant regardless of client-supplied filters. SPEC.md's contract calls this endpoint "public" without narrowing it further, and only test data exists for this PoC, so this is accepted rather than added scope (e.g. a `SECURITY DEFINER` function taking a required `join_code` parameter would close it, at the cost of losing plain `GET` semantics the API contract specifies) — revisit before any real event's join code should stay unguessable.

## Risks / Trade-offs

- **Email rate limits** — see D3.
- **`SECURITY DEFINER` functions are a common source of RLS bypass bugs if written carelessly** → `join_event` only ever touches `event` (read) and `participant` (read/insert scoped to `auth.uid()`), never anything wider; covered by the same real-HTTP test pattern as MILESTONE-02.
- **The profanity wordlist is a starter list, not exhaustive** → accepted for the PoC (FR-069 asks for "a wordlist," not perfection); admins can already hide/rename any player post-hoc per the existing moderation model (SPEC.md §5.6).
- **`enable_confirmations` is a real behavior change to existing local dev** — anyone testing locally after this change needs a confirmed account (or the anonymous path) to get a usable session; called out in the task list and README.

## Migration Plan

1. Migration: `join_event` function, `profanity_word` table + seed data, `is_profane`.
2. `supabase/config.toml`: `enable_confirmations = true`; restart the local stack to pick it up (same requirement discovered in MILESTONE-02 for `enable_anonymous_sign_ins`).
3. `apps/web`: Supabase client, auth state, the onboarding flow's screens, placeholder ToS/Privacy pages.
4. `tools/db`: `join_event` RPC tests + the Mailpit-based confirmation-flow test.
5. CI: extend the existing Supabase-backed test step (already running since MILESTONE-02) — no new CI job needed, `join_event`'s tests are more Vitest cases in the same suite.
6. `supabase db push` to production; flip `enable_confirmations` on in the production dashboard (config.toml doesn't reach production — it's a local-stack-only file).
7. Owner adds the real Terms of Service / Privacy Policy text whenever it's drafted (REQUIREMENTS.md §5.4 — legal work, explicitly out of scope for the Architect/this change); the placeholder pages this change ships are a stand-in, not a blocker.
