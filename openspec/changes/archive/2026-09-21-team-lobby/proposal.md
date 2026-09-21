## Why

A player can join an event (MILESTONE-03) but has no way to form or join a team before the event starts — SPEC.md's audience-facing model is explicitly solo-or-team, and team formation has to happen before `mc:start` locks membership. SPEC.md §8 "MILESTONE-06: Team lobby" is next in the milestone sequence and depends on the already-archived MILESTONE-02 (data-model-rls) and MILESTONE-03 (auth-onboarding).

## What Changes

- Add four Postgres RPCs, mirroring `join_event`'s `SECURITY DEFINER` pattern: `create_team(event_id, name)` (creator becomes captain and joins their new team, switching off any prior one), `join_team(team_id)` (any player joins any non-dissolved team — no cap, no approval — also handling a direct switch), `leave_team()` (returns the caller to solo play), `rename_team(team_id, name)` (captain only). All four require the caller to hold a `participant` row for the event/team in question and only succeed while `event.status = 'draft'`. `create_team`/`rename_team` reject a profane name via the existing `is_profane()` function. **Scope note**: FR-018 cites "(subject to FR-051)", but FR-051 is about step-scoring winners — the actual profanity-filter requirement is FR-069, which explicitly names "every display name and team name"; these RPCs implement FR-069's intent, not FR-051's literal (irrelevant) text.
- These four RPCs become the sole path for team-membership and team-name mutations — no direct write path exists for `participant.team_id`, `team.name`, or `team.captain_participant_id`, mirroring `join_event`'s "sole path for participant creation."
- Add a Postgres trigger on `event` that fires when `status` transitions to `live`: it dissolves any team with fewer than two members and reassigns their members to solo play (`participant.team_id = null`). This is decoupled from the EventRoom/WebSocket layer — it fires on the `event.status` column change itself, regardless of what causes it, so MILESTONE-07's future `mc:start` handler needs only to set that column and this milestone's dissolution/lock guarantees already hold.
- Add a team-lobby step to the player onboarding flow (`apps/web`), shown after a successful `join_event` only while the event is still `draft`: create a team, browse and join any open team, switch teams, leave to solo, and (if captain) rename the team. Refetch-based, not real-time — the EventRoom's `roster` message is aggregate counts only, and no milestone before this one wires team-specific realtime sync.

**Assumption** (recorded here and in design.md, not raised as a pause-worthy ambiguity): if a team's captain leaves or switches teams, captaincy is not reassigned — the team becomes captain-less rather than auto-promoting another member. Neither SPEC.md nor REQUIREMENTS.md specify a succession rule; admin-driven fixup (`moderate_team`, MILESTONE-11) is the existing backstop for this kind of edge case.

**Out of scope** (later milestones per SPEC.md §8): `moderate_team` (admin hide/rename) — MILESTONE-11; real-time team-roster sync via EventRoom — not scoped anywhere yet; the actual `mc:start` WebSocket command — MILESTONE-07 (this milestone's trigger already covers what happens once it runs).

## Capabilities

### New Capabilities
- `team-lobby`: the player-facing team formation flow — creating, joining, switching, leaving, and renaming a team before an event starts.

### Modified Capabilities
- `data-model`: adds the four team RPCs as the sole path for team-membership/name mutations, and the lock/dissolution invariant enforced at the moment an event goes `live`.

## Impact

- `supabase/migrations`: one new migration — four `SECURITY DEFINER` RPC functions, an `AFTER UPDATE` trigger on `event`, no new tables (schema already complete from MILESTONE-02).
- `apps/web`: `OnboardingFlow` gains a new step after `join_event` succeeds; new team-lobby components/hooks under `src/routes/player/`; new FR/EN copy entries (player surfaces stay bilingual, per project convention).
- No change to `apps/party`, `packages/shared`, or existing RLS policies on other tables.
