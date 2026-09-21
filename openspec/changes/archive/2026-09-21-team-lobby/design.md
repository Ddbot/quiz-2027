## Context

See proposal.md - Why/What Changes for motivation and scope. Relevant existing state:

- `team` (`id`, `event_id`, `name`, `captain_participant_id`, `dissolved`, `hidden`, `created_at`) and `participant` (`id`, `event_id`, `profile_id`, `display_name`, `team_id`, ...) already exist from MILESTONE-02, including the case-insensitive unique index `team_event_name_lower_idx on team (event_id, lower(name))` — team-name uniqueness (FR-019) needs no new constraint, just a friendly error when the RPC hits it.
- `join_event` (MILESTONE-03, `supabase/migrations/20260914140924_join_event.sql`) is the proven template: a `SECURITY DEFINER` function, `revoke all ... from public, anon` + `grant execute ... to authenticated` (Supabase sessions — anonymous or account — carry `role = authenticated`; `anon` means no session at all), raising a distinct exception per error case (`errcode = 'P0001'`, message = the error keyword the client matches on).
- `is_profane(text)` (same migration) already checks a display name against the FR/EN wordlist and is already revoked from `public`/`anon`, granted to `authenticated`/`service_role` — reused as-is for team names, which is exactly what FR-069 (not FR-051 — see proposal.md's scope note) asks for.
- `event_is_draft(uuid)` (MILESTONE-02 RLS-helpers) already exists and is exactly the "event.status = 'draft'" check every team RPC needs.
- The existing `event` UPDATE RLS policy (`using (is_admin() and status = 'draft') with check (is_admin() and status = 'draft')`) cannot itself transition `status` away from `'draft'` — its `WITH CHECK` requires the resulting row to still be `'draft'`. So today, nothing except a service-role write (bypassing RLS entirely) can ever set `status = 'live'`; that's reserved for the future `mc:start` handler (MILESTONE-07) or, for this milestone's own tests, the admin/service-role test client — the same pattern `tools/db/test/rls.test.ts` already uses to test the "content locked once live" requirement.
- The player onboarding flow (`apps/web/src/routes/player/OnboardingFlow.tsx`, MILESTONE-03) ends at a terminal "joined" screen once `join_event` succeeds, with no further step — this change inserts a new step there.

## Goals / Non-Goals

**Goals**: a player can create/join/switch/leave/rename a team before an event starts, entirely through server-side RPCs mirroring `join_event`'s access-control posture, with the lock-and-dissolve invariant enforced independently of whatever eventually flips `event.status` to `live`.

**Non-Goals**: `moderate_team` (admin hide/rename) — MILESTONE-11; any EventRoom/WebSocket involvement — no milestone has scoped team-specific realtime sync yet; captain succession on departure (see D5).

## Decisions

### D1: Four new RPCs, each mirroring `join_event`'s `SECURITY DEFINER` + revoke/grant pattern exactly

`create_team(p_event_id uuid, p_name text)`, `join_team(p_team_id uuid)`, `leave_team(p_event_id uuid)` (see D2 for the parameter), `rename_team(p_team_id uuid, p_name text)` — each: requires `auth.uid()` is set; resolves the caller's `participant` row for the relevant event (rejecting `not_a_participant` if none); requires `event_is_draft(...)` (rejecting `event_not_joinable` otherwise); does its specific business-rule check; mutates `participant.team_id` and/or `team` columns; returns a small `jsonb` payload. Same `revoke all ... from public, anon; grant execute ... to authenticated;` as `join_event` and `is_profane`.

### D2: `leave_team` takes an explicit `p_event_id` parameter, deviating from SPEC.md's literal `{}` request shape

SPEC.md §7.4.1 lists `leave_team` as taking no parameters, implicitly operating on "the caller's current team." But a profile can in principle hold `participant` rows in more than one still-`draft` event at once (nothing prevents joining two events that haven't started yet), making a truly parameter-less call ambiguous about which one to act on. `p_event_id` is the same kind of unambiguous anchor `join_team`/`rename_team` already get for free via `p_team_id` (a team belongs to exactly one event). The player-facing behavior is identical either way — the UI always knows which event it's showing — so this is a narrow RPC-contract refinement, not an observable behavior change.

### D3: Dissolution runs as a Postgres trigger on `event`, snapshotting undersized teams before mutating either table

`AFTER UPDATE ON event FOR EACH ROW WHEN (NEW.status = 'live' AND OLD.status IS DISTINCT FROM 'live')` calls a `SECURITY DEFINER` function that first computes the set of non-dissolved teams with fewer than two members (a single query, into an array), then applies two mutations against that fixed set: null out `participant.team_id` for their members, and mark those teams `dissolved = true`. Snapshotting first avoids a real bug the naive version has — computing "team size" via a second `COUNT` query issued *after* the first mutation would undercount, since the members were just nulled out.

**Alternative considered**: doing this dissolution inside the future `mc:start` WebSocket handler (MILESTONE-07) instead of a trigger. Rejected — MILESTONE-06's own scope and acceptance criteria are phrased entirely in terms of `event.status`, not a specific command, and a trigger means `mc:start` only ever needs to flip that one column; the invariant is already fully built and tested by the time MILESTONE-07 exists, with nothing left to implement there.

### D4: Team-name conflicts surface as a friendly `name_taken` error, not a raw constraint violation

`create_team`/`rename_team` wrap their `INSERT`/`UPDATE` in a `BEGIN ... EXCEPTION WHEN unique_violation` block, catching `team_event_name_lower_idx`'s violation and re-raising as `name_taken` (matching SPEC.md §7.4.1's `409 { error: "name_taken" }`), so the client gets the same clean, matchable error string pattern already established for `join_event`'s `invalid_code`/`profanity`/`event_not_joinable`.

### D5: Captain succession is not automated when a captain leaves or switches teams (assumption, not a pause-worthy ambiguity)

Neither SPEC.md nor REQUIREMENTS.md specify what happens to a team's `captain_participant_id` if that participant leaves or switches teams. This change leaves it unchanged in that case — the team becomes effectively captain-less (its `captain_participant_id` no longer matches any current member, so `rename_team`'s captain check will reject everyone) rather than auto-promoting another member. For a zero-cost PoC this is an acceptable, low-frequency edge case with an existing backstop: an admin can fix a team's name directly once `moderate_team` (MILESTONE-11) exists, or via the SQL editor today.

### D6: The team-lobby UI step is refetch-based, not wired to the EventRoom WebSocket

Every create/join/leave/rename action re-fetches the event's team list from Postgres afterward; no player sees another player's team change happen live without refreshing. SPEC.md's `roster` server message (aggregate `{players, teams, connected}` counts) doesn't carry team-membership detail, and no milestone up to and including this one scopes wiring team-specific data through the EventRoom — building that now would be scope creep beyond what MILESTONE-06's own plan describes.

## Risks / Trade-offs

- [Risk] Without live sync, two players could both see a team as available and join at the same moment — both succeed (no cap, so this is actually fine; "no cap, no approval" per FR-013 means concurrent joins are supposed to both succeed, not race-fail).
- [Risk] A captain-less team (D5) can never be renamed again by a player — Mitigation: acceptable for this PoC; admin fixup is the documented backstop.
- [Risk] `leave_team`'s added `p_event_id` parameter (D2) is a narrow deviation from SPEC.md's literal contract — Mitigation: no observable player-facing behavior changes; documented here for traceability if SPEC.md is later reconciled.

## Migration Plan

1. New Supabase migration: four RPC functions (D1/D2), the dissolution trigger + function (D3), following the existing `SECURITY DEFINER` + explicit revoke/grant pattern throughout.
2. No new tables or columns — `team`/`participant` already carry everything needed (MILESTONE-02).
3. `apps/web`: a new team-lobby step in `OnboardingFlow`, new components/hooks, new FR/EN copy entries.
4. Deploy through the existing pipeline; `supabase db push` to production after local verification, same confirmation gate as prior milestones.
5. Rollback: additive only (new functions, new trigger, no altered/dropped columns) — a plain `git revert` plus dropping the new functions/trigger if ever needed.

## Open Questions

None — the two decisions that could have been ambiguous (`leave_team`'s parameter shape, captain succession) are resolved above rather than left open.
