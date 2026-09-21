## Context

See proposal.md - Why/What Changes for motivation and scope. Relevant existing state:

- `apps/party/src/EventRoom.ts` (MILESTONE-05) already has: JWT verification, role resolution (`{role, profileId}` in `connection.state`), `RoomState`/`applyMutation`/`requireFlowController` in `packages/shared`, a `room_state` SQLite table via `this.sql`, and the one working command, `mc:claim_control`. `requireFlowController` has been built and unit-tested since MILESTONE-05 but never actually wired into a real command handler — this milestone is the first to use it for real.
- `partyserver@0.5.10`'s `Server` base class exposes `onAlarm(): void | Promise<void>` and (per its own doc comments) a protected `this.ctx: DurableObjectState`, so `this.ctx.storage.setAlarm(timestamp)` / `this.ctx.storage.deleteAlarm()` are available for the auto-lock-at-expiry mechanism — no new dependency needed.
- `step` (`id`, `event_id`, `position`, `game_type`, `timed`, `countdown_seconds`, `points_correct`, `team_award_points`, `status`, `timer_started_at`) and `game_mcq` (`step_id`, `question_text`, `options` jsonb, `correct_option_id`) already carry everything this milestone's Postgres *reads* need (MILESTONE-02). `answer` (`step_id`, `participant_id`, `option_id`, `submitted_at`, `receipt_seq`, `is_correct` not null, `scored_points` not null) exists too, but `is_correct`/`scored_points` have no default and aren't knowable until scoring exists (MILESTONE-08) — confirms this milestone must NOT write to Postgres `answer` at all; per NFR-014/FR-082 the DO's own SQLite is the immediate durability boundary, Postgres is only touched at `mc:reveal`.
- The `event` UPDATE RLS policy (`using/with check (is_admin() and status = 'draft')`, MILESTONE-02) already means only a service-role write can move `status` away from `draft` — `mc:start` is that write. MILESTONE-06's dissolution trigger already fires on exactly this transition, so team lock/dissolution needs no new code here.
- `apps/web/src/routes/ScreenRoute.tsx`'s dev-only ping widget (MILESTONE-01) is the only existing `PartySocket` usage in the browser app — confirms the client library's call shape (`new PartySocket({ host, party: "event-room", room })`, `query` option for `?token=`) without needing to read its source from scratch.
- `apps/web`'s `partysocket` dependency has existed unused since the MILESTONE-01 scaffold; this is the first milestone to actually wire it into player-facing code.

## Goals / Non-Goals

**Goals**: a flow-controller can run a step-by-step MCQ round end to end (start → active → locked/advance → ...); a player can see the question, answer once, and have that answer durably accepted under timer authority; the propagation mechanism is load-tested at 10 connections.

**Non-Goals**: reveal, scoring, leaderboard, end (MILESTONE-08/10); the big screen's real views or `operator:display` (MILESTONE-09) — `RoomState.display` is deliberately left untouched by this milestone's commands, since meaningfully setting it needs Operator-driven choice that doesn't exist yet; `mc:kill_switch` (MILESTONE-11); reconnect/backoff hardening beyond what MILESTONE-05 already built (MILESTONE-14).

## Decisions

### D1: `mc:start`/`mc:advance`/`mc:lock` all gate on `requireFlowController`, finally putting MILESTONE-05's guard to use

Each handler checks `connection.state.role === "admin"` and `requireFlowController(state, connection.state.profileId)` before doing anything, rejecting with `forbidden` otherwise — the exact mechanism `mc:claim_control` deliberately bypassed (design.md D6, MILESTONE-05) and that every *other* flow-control command was always meant to use.

### D2: `mc:start` performs the Durable Object's first real Postgres write

`mc:start` calls the existing service-role Supabase client (already built for role resolution) to `update event set status = 'live', season_year = <current calendar year> where id = <event id> and status = 'draft'`, checking the update actually affected a row (guards against a stale/duplicate `mc:start` racing another). Season year is a simple calendar-year default — SPEC.md's own MILESTONE-13 explicitly owns "season_year derivation," implying a more careful boundary rule may replace this later; recorded here rather than silently assumed permanent. This corrects MILESTONE-05 design.md's stated assumption that the first DO→Postgres write would be MILESTONE-08's scoring flush.

**Alternative considered**: performing this write via a new Postgres RPC (mirroring `join_event`/the team RPCs) instead of a direct service-role table update. Rejected — those RPCs exist to let *players* safely self-serve past RLS; the DO already holds the service-role key and bypasses RLS entirely by design (SPEC.md §7.5), so an RPC indirection here adds a layer with no security benefit.

### D3: A single Durable Object alarm tracks the active step's expiry, always rescheduled on every step transition, and validates freshness before acting

`ctx.storage.setAlarm(timerStartedAtMs + countdownSeconds*1000 + GRACE_MS)` is called whenever a step becomes active and is timed; `ctx.storage.deleteAlarm()` is called (or simply not scheduled) for an untimed step. Cloudflare Durable Objects support exactly one alarm at a time — setting a new one implicitly replaces whatever was pending, so `mc:advance`/explicit `mc:lock` naturally supersede a stale alarm without extra bookkeeping. `onAlarm()` re-reads current state and only transitions to `locked` if the step the alarm was scheduled for is still `active` (idempotent no-op otherwise via `applyMutation`'s reference-equality check) — guards against an alarm firing after the step already moved on some other way.

`GRACE_MS = 2000` (a fixed 2-second allowance for network latency between client and server) — SPEC.md specifies "a small fixed latency grace" without pinning a number; exported from `packages/shared` so the same constant is available to a future client-side mirror (design.md D8) and to tests, without drifting.

### D4: The real hard-lock enforcement is a fresh time check in `answer:submit`, not reliance on `step.status`

`answer:submit` independently computes `now > timerStartedAt + countdownSeconds*1000 + GRACE_MS` and rejects on that basis, regardless of whether the alarm has already flipped `step.status` to `locked` — Durable Object alarm delivery has its own scheduling latency, so relying solely on `status === 'locked'` would create a small window where a technically-late answer could still be accepted. The `status` transition (D3) is for broadcasting the lock to clients, not the authoritative deadline itself.

### D5: Accepted answers persist to a new local SQLite table (`this.sql`), never Postgres, with the row's own autoincrement id as `receipt_seq`

```sql
create table if not exists local_answer (
  id integer primary key autoincrement,
  step_id text not null,
  participant_id text not null,
  option_id text not null,
  submitted_at text not null,
  unique (step_id, participant_id)
)
```
`id` (SQLite's native autoincrement) *is* `receipt_seq` — genuinely monotonic per Durable Object instance, no separate counter to maintain. The `unique (step_id, participant_id)` constraint is the storage-level backstop for FR-042, in addition to the application-level check `answer:submit` does before inserting (design.md D4's kind of belt-and-suspenders, applied to a different invariant). This table is created in the constructor alongside `room_state` (MILESTONE-05's pattern).

**Alternative considered**: writing directly to Postgres `answer` at submit time with placeholder `is_correct`/`scored_points` values, corrected later at reveal. Rejected — those columns exist to record final, scored truth; writing meaningless placeholders now and overwriting them later is exactly the kind of eventually-consistent complexity NFR-014's "DO SQLite immediately, Postgres by end of step" design explicitly avoids.

### D6: `RoomState` gains a `question` field, populated from Postgres whenever a step becomes active

`RoomState.question: { text: string; options: { id: string; label: string }[] } | null` — populated by a `game_mcq` read (service-role, same client as role resolution) whenever `mc:start`/`mc:advance` activates a step, included in every `state`/`StateMessage` broadcast from then on. `correct_option_id` is never read into this shape at all — not filtered out afterward, simply never selected from Postgres, so there is no path for it to leak into a broadcast.

### D7: `answer:submit`'s acknowledgment is a new `answer_ack` message, sent only to the submitter

Not in SPEC.md's literal Server→Client table, but needed: without it, a client has no way to distinguish "my answer was accepted" from "the server hasn't gotten to it yet" other than silence, which is a poor UX foundation for a confirm-then-wait interaction. `{ type: "answer_ack", stepId, optionId }`, sent via `connection.send`, not broadcast.

### D8: The player UI computes its own expiry from the snapshot's `serverNow`, refreshed on every state message

On each `state`/`StateMessage` received, the client computes `clockOffsetMs = Date.parse(serverNow) - Date.now()`; expiry for the current step is `Date.parse(timerStartedAt) + countdownSeconds*1000 + GRACE_MS` compared against `Date.now() + clockOffsetMs`. Recomputing the offset on every message (not just the first) keeps it accurate across a long-lived connection without needing a dedicated clock-sync protocol — adequate for this project's latency/scale profile (NFR-001's 2-second budget at 10 connections).

### D9: `mc:advance` on the last step, and `mc:start` on an event with zero steps, are explicit rejections

`no_next_step` and `no_steps` respectively — SPEC.md's protocol table doesn't specify these edge cases (ending the event is `mc:end`'s job, MILESTONE-10; an event with no authored steps is a content-authoring mistake, not a flow-control concern), but leaving them unhandled would mean an ambiguous silent no-op or an unhandled exception. Explicit, named rejections keep the contract as defined as everything else in this milestone.

## Risks / Trade-offs

- [Risk] `season_year` as a plain calendar year may not match the "real" season boundary MILESTONE-13 will define (e.g. a season spanning a year change) → Mitigation: explicitly flagged (D2) as a placeholder pending that milestone; `season_score`'s existing consumers already treat `season_year` as an opaque grouping key, so revising the derivation later needs no schema change.
- [Risk] `RoomState.display` staying inert this milestone means the big screen has nothing new to render yet even once a round is live → Mitigation: expected — `ScreenRoute.tsx` is explicitly still a MILESTONE-09 placeholder; this milestone's acceptance criteria (SPEC.md §8) don't ask for big-screen behavior.
- [Risk] A 2-second fixed grace (D3) is a guess, not a measured value → Mitigation: acceptable for this project's zero-cost/10-connection PoC scale; easy to tune later without a shape change since it's one named constant.

## Migration Plan

1. `packages/shared`: extend `RoomState`/`StateMessage` with `question`; add `GRACE_MS`; add command/ack message types (`McStartCommand`, `McAdvanceCommand`, `McLockCommand`, `AnswerSubmitCommand`, `AnswerAckMessage`).
2. `apps/party`: extend `EventRoom.ts` — three new command handlers, `onAlarm`, the `local_answer` table, the `game_mcq` fetch-on-activate helper, the Postgres `event` write in `mc:start`.
3. `apps/party/test/eventroom.test.ts`: extend with the new command/alarm/answer scenarios, reusing the existing real-Supabase-integration harness (`@cloudflare/vitest-pool-workers` + genuine signed-in users) and adding real `step`/`game_mcq` fixtures.
4. `apps/web`: new WebSocket hook + live-game view components; `OnboardingFlow`/the team-lobby step gain the connect-and-branch-on-`eventStatus` logic.
5. No Postgres migration this milestone — deploy through the existing pipeline (worker via the GitHub Action, web via Vercel).
6. Rollback: additive to `apps/party`/`apps/web`/`packages/shared` only — a plain `git revert`; no data migration (the DO's local `local_answer` table is disposable per-event scratch state, matching `room_state`'s existing posture).

## Open Questions

None — the edge cases that could have been ambiguous (advance-past-last-step, zero-step event, exact grace value, what `display` should do) are resolved above rather than left open.
