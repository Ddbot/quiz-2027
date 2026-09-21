## Context

Two pieces of infrastructure this milestone builds on are already in place and unchanged by this design:

- Server-side profanity filtering: `public.profanity_word` (FR+EN starter list) and `public.is_profane(candidate text)` (case-insensitive substring match), enforced inside `join_event`, `create_team`, `rename_team` since MILESTONE-03/06 (`supabase/migrations/20260914140924_join_event.sql`, `20260915085750_team_lobby.sql`).
- `hidden boolean not null default false` already exists on both `participant` and `team` (MILESTONE-02, `20260914120108_data_model.sql`), with admin-inclusive SELECT RLS already in place (`participant_select_self_or_admin`, `team_select_participant_or_admin`). No new column or SELECT policy is needed.

`EventRoom.ts`'s existing `handleClaimControl`/`handleOperatorDisplay` are the precedent for "any admin, not flow-controller-gated" command handling — `mc:kill_switch` follows the same shape. `computeRankings`/`handleMcReveal` (MILESTONE-08/09/10) are the precedent for building `RankingsMessage`/`StepResultsMessage` from fresh Postgres reads — the hidden-filter is a small addition to that existing query/assembly path, not a new mechanism.

## Goals / Non-Goals

**Goals:**
- Instant client-side profanity feedback that can never be more permissive than the server (server stays authoritative).
- Admin moderation (hide/rename) that works regardless of event status, reusing the security-definer RPC pattern already established for `create_team`/`rename_team`.
- A kill switch that reaches every connection (not just screens), is independent of `display`/step state, and clears with zero residue.
- Hidden participants/teams excluded from what the big screen shows, without touching the scoring math or the persisted record.

**Non-Goals:**
- Editing the wordlist content from the console (an admin cannot add/remove words this milestone — the list is a fixed starter set, same status quo as MILESTONE-03).
- Un-hiding retroactively re-triggering a broadcast (D4 below) — moderation takes effect on the next natural recompute, not an immediate push.
- Any change to `event_dashboard`/GDPR flows (MILESTONE-12/13).

## Decisions

### D1: The shared wordlist module is the single source of truth; the migration seeds from it

`packages/shared/src/profanity.ts` exports the literal FR+EN word array and `isProfane(candidate: string): boolean` (same case-insensitive substring semantics as `is_profane()`, so the two never disagree on a given input). The new migration's `insert into profanity_word` statement is generated from that same literal list at authoring time (copy-pasted into the SQL, with a comment pointing back at the shared module as the source) rather than maintained independently — there's no runtime mechanism to sync a TS array into a SQL migration automatically, so the discipline is "edit the shared module, then regenerate the seed insert," documented inline in both files. This is a starter list, same trade-off already accepted in MILESTONE-03 (short substrings can false-positive; not an exhaustive classifier).

Alternative considered: have the client fetch the wordlist from Postgres at runtime instead of bundling it. Rejected — adds a network round trip defeating the "instant" goal, and the list is small/static enough that bundling is simpler and offline-safe.

### D2: `moderate_participant`/`moderate_team` are security-definer RPCs, not RLS-gated table writes

Following `create_team`/`rename_team`'s exact pattern: `security definer` PL/pgSQL functions that check `is_admin()` internally and then write directly, bypassing RLS entirely (consistent with how `team_admin_write_while_draft` already coexists with `create_team`'s unrestricted-by-that-policy security-definer writes — the RPC doesn't rely on that policy at all). This is what makes "callable regardless of `event.status`" trivial: there is no status check in the function body, unlike `event_admin_write_while_draft`'s RLS policy which the direct-table-write path is still subject to (irrelevant here since these RPCs never go through that path).

Signature: `moderate_participant(p_participant_id uuid, p_hidden boolean default null, p_display_name text default null)`, `moderate_team(p_team_id uuid, p_hidden boolean default null, p_name text default null)`. A `null` parameter leaves that field unchanged (partial update, matching the REST contract's `hidden?`/`display_name?`/`name?` optionality). A non-null name is checked with `is_profane()` before writing, raising the same `profanity` exception `create_team`/`rename_team` already use.

### D3: `RoomState.killSwitch: boolean`, independent of `display`; rendering-layer overlay plus a defensive `answer:submit` reject

A new top-level `RoomState.killSwitch` field (default `false`), broadcast via the existing `state`/`StateMessage` (already sent to every connection, all roles, per MILESTONE-05's original design — no new message type needed). `mc:kill_switch` only ever flips this one field; it never reads or mutates `display`/`step`, so "clears cleanly" (SPEC.md's acceptance criterion) falls out for free — the underlying state was never touched, so clearing the flag just stops the overlay from being drawn, in one client-side conditional.

Client-side: `ScreenViews.tsx`'s `BigScreenView` and the player's connected view (`OnboardingFlow.tsx`/`LiveGameView.tsx`) both check `killSwitch` first, before their existing `display`/status branching, and render a full blank overlay when true — a single early-return guard in each, not a new state machine.

`answer:submit` also checks `killSwitch` and rejects with a dedicated error code if active. This is defensive rather than load-bearing (the submitting player's own UI is already blanked, so they have no way to submit through the normal UI), but it closes the gap where a client mid-flight request (sent a moment before the blank paints, or a non-standard client) would otherwise still be scored — "freeze" in FR-039 reads as covering exactly this.

Alternative considered: reuse `display: "blank"` (already exists as a `RoomDisplay` value since MILESTONE-09) instead of a new field. Rejected — `display` is a single value the Operator otherwise controls via `operator:display`, and reusing it for the kill switch would either clobber the Operator's chosen view when cleared (no way to remember what to restore) or require a second "previous display" field to restore into, which is exactly what a separate boolean avoids. It also wouldn't naturally reach player devices' own screen logic without giving `display` new meaning there, when player views don't otherwise consume `display` today.

### D4: Hidden-filtering happens once, in `computeRankings` and `handleMcReveal`'s results assembly — not renumbered, not re-fetched elsewhere

`fetchRoster` and `computeRankings`'s own `team` query both gain a `hidden` column in their `select`. The scoring input (`scoreStep`'s `participants` array) is built from the *unfiltered* roster, exactly as today — hidden status never reaches the scoring module, so a hidden participant's answer is scored, persisted to `answer`/`step_result_*`, and counted toward their team's total exactly as anyone else's. Only at the very end of `computeRankings` (building `individualRanked`/`teamRanked` into the returned arrays) and at the end of `handleMcReveal`'s `stepResults.participants` assembly does a `.filter((p) => !hidden)` drop hidden rows from what gets broadcast/cached — after `rankByTotal` has already assigned ranks over the full set, so a hidden #1 leaves a gap (rank 2 stays "2", not renumbered to "1"). `event_final_*` persistence (`mc:end`) also stays unfiltered — the final record keeps everyone; only the live `rankings`/`step_results` *messages* are filtered.

A hide/rename applied via the RPCs has no corresponding push to the Durable Object — it's a plain Postgres write with no event-room notification. Its effect on an already-broadcast/cached `lastStepResults`/`lastRankings` is therefore visible starting from the next `mc:reveal`/`mc:show_leaderboard`, consistent with how this system already treats "recompute on demand" everywhere else (e.g. MILESTONE-10's `mc:show_leaderboard` always recomputing rather than being pushed reactively). Not treated as a gap to fix this milestone.

### D5: Moderation UI and the kill-switch toggle both live on `LiveControlPage.tsx`

`LiveControlPage` already renders regardless of `eventStatus` (only individual flow-control buttons are status-gated) and is already the one page holding the live `useEventRoom` connection every other admin command goes through — adding a "Modération" section (roster list + hide/rename controls, fetched via a direct PostgREST read against `participant`/`team`, not through the WebSocket) and a kill-switch toggle here avoids a second page/connection. The roster read is a plain `TanStack Query`-style fetch-on-mount plus a manual refetch after each moderate action (no realtime subscription — consistent with the rest of the console, which is action-driven, not live-subscribed, outside the WebSocket-backed flow-control state).

## Risks / Trade-offs

- [Two independently-maintained profanity lists (TS module, SQL seed) can drift if only one is edited] → Both files carry an explicit comment pointing at the other; low-risk given the list rarely changes and is a starter set, not a compliance-grade filter (same accepted risk as MILESTONE-03).
- [A hide/rename doesn't retroactively refresh an already-cached leaderboard until the next reveal/show-leaderboard] → Documented as accepted (D4); the MC console's own moderation action could optionally prompt "click Show Leaderboard to refresh the screen," left as a copy-only nicety, not required behavior.
- [The defensive `answer:submit` reject during an active kill switch is mostly unreachable through the normal UI, since the client is already blanked] → Acceptable; it's a backstop, not the primary mechanism, and costs one extra `if` in an existing handler.

## Migration Plan

One new Postgres migration (`moderate_participant`/`moderate_team`); no destructive change, no data backfill (both tables' `hidden` column already defaults `false`). Deploys the same way every prior milestone's migration has (`supabase db push` in production, `supabase db reset` locally). No rollback complexity beyond dropping the two new functions if ever needed — nothing depends on their existence structurally.
