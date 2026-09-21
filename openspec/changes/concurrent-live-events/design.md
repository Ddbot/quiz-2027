## Context

See proposal.md - Why. The only enforcement point is `event_one_live_idx`, a Postgres partial unique index (`supabase/migrations/20260914120108_data_model.sql`). Every other layer — `apps/party`'s `EventRoom` Durable Object (keyed per event id), `apps/web`'s routing and admin console (already list-based, per-event), every trigger that fires on `status = 'live'` — is already scoped to a specific event's own id, confirmed by re-reading each during this milestone's own investigation (see proposal.md's Impact section).

## Goals / Non-Goals

**Goals:**
- Remove the single-live-event ceiling with no data migration, matching FR-028's original promise.
- Prove — not just assert — that two events can be live at once, at both the Postgres level (RLS suite) and the real end-to-end level (harness, two concurrent real `EventRoom` Durable Objects).
- Fix the CI flake this constraint caused (poc-validation-run task 2.1) as a natural consequence, not a separate effort.

**Non-Goals:**
- No cap or quota system on concurrent events (the owner didn't ask for one; adding one would be scope creep — see proposal.md).
- No changes to `EventRoom.ts`, RLS policies, or the admin console — none of them assumed single-live-event; there's nothing there to change.
- No capacity/load testing beyond what this project already validates (10 connections per event, per SPEC.md G-1). Two or three concurrent small events, each within that same per-event budget, is what's being proven — not an arbitrary N.

## Decisions

**D1 — Drop the index outright, no replacement constraint.** The owner asked for "more than one event at a time" with no stated cap. Introducing a soft cap (e.g., "at most 5 live events") would be an invented requirement nobody asked for, and the free-tier resource math doesn't call for one at this project's scale (a handful of company events, not hundreds) — see Risks below.

**D2 — `tools/db/test/rls.test.ts`'s existing single-live-event test flips in place rather than being deleted.** It already has exactly the right fixtures (`eventLive`, already seeded `live`; `eventA`, seeded `draft`) to prove the new behavior with a one-line change to the assertion plus a renamed describe block — deleting it and writing a new test from scratch would just re-derive the same setup.

**D3 — `tools/harness` gets a second, minimal concurrent event, additive to the existing 10-participant scenario rather than replacing any of it.** The existing scripted scenario and its hand-calculated scoring assertions (design.md D4 of `poc-validation-run`) are exactly what MILESTONE-15 validated and stay untouched — lower risk than reshaping that scenario. The new proof is a second small event (2-3 participants, 1 step) whose flow is interleaved with the first: event B is started while event A is still live, Postgres is queried to confirm both rows show `status = 'live'` simultaneously, then event B runs to completion independently of event A's own script. This exercises the actual thing in question — two live `EventRoom` Durable Objects coexisting on the same running `wrangler dev` instance — not just a Postgres-level assertion.

**D4 — `apps/party/test/eventroom.test.ts`'s `afterEach` cleanup logic is unchanged; only its comment is corrected.** The cleanup (deleting every event a test created) remains good practice regardless of this constraint — it keeps the database tidy across a long test run — so only the rationale in the comment (which currently frames it as releasing "the one live event slot") needs to stop implying a global lock that no longer exists.

**D5 — `SPEC.md` is edited directly (FR-027's text, the data-model section's index note, the Event glossary entry); `openspec/specs/data-model/spec.md` is not touched during apply.** Matching this project's established OpenSpec convention throughout: the main capability spec under `openspec/specs/` is only updated when the change is archived (`/opsx:sync`/`/opsx:archive`), never during apply. `REQUIREMENTS.md` is the owner's own original document and is never edited by any milestone.

## Risks / Trade-offs

- [Risk] Multiple concurrent live events means multiple concurrent Cloudflare Durable Objects and multiple concurrent Supabase Realtime/Postgres connections, against the project's €0-budget constraint (SPEC.md G-5). → Mitigation: at the project's actual scale — the owner's own company events, not a public product — this stays well within Cloudflare Workers' free-tier DO limits and Supabase's free-tier connection pool. Not a blocker; worth re-confirming with the owner only if usage ever grows toward the "typical ~50 / crash-tested 500" figures REQUIREMENTS.md §6.3 already puts on record for a *single* event, since that's the scale where free-tier headroom would first matter.
- [Risk] A future capability could accidentally reintroduce a single-live-event assumption (e.g., a "current event" convenience query that forgets to filter by id). → Mitigation: none of the code audited for this change had that pattern; nothing here needs a guard rail beyond normal code review, since every route/query is already required to carry an event id to compile/typecheck in the first place (TypeScript route params, RLS's own event-scoped policies).
