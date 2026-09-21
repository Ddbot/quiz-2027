## Context

See proposal.md for motivation/scope. Relevant existing state:

- `apps/party/src/EventRoom.ts` (MILESTONE-05/07): `requireController`/`requireFlowController` gating pattern, `applyMutation`'s reference-equality idempotency primitive, the local SQLite `local_answer` table (`id` autoincrement doubling as `receipt_seq`), and the service-role Supabase client (`getSupabase()`) already used for `mc:start`/`mc:advance`'s reads/writes.
- `RoomStep.status` has included `"revealed"` in its union since MILESTONE-05, unused until now.
- Postgres already has `answer`, `step_result_participant`, `step_result_team` (MILESTONE-02) with the right columns/defaults and admin-only `select` RLS — the DO writes via the service-role key, which bypasses RLS, so no new migration is needed.
- Team dissolution (MILESTONE-06's `event_status_live_dissolves_small_teams` trigger) already nulls `participant.team_id` for anyone left in a dissolved (<2 member) team at `mc:start` time — the scoring module never needs to special-case dissolved teams; `participant.team_id` is already correct by the time any step is scored.
- `apps/web/src/routes/player/LiveGameView.tsx` (MILESTONE-07) already branches on `step`/`answerAck`/`isExpired`; this milestone adds a fourth branch for the revealed result.

## Goals / Non-Goals

**Goals**: `mc:reveal` scores the just-locked step, durably persists the result, and every player learns their own outcome; running individual/team rankings are available from Postgres, not only DO memory.

**Non-Goals**: the big screen's own results/leaderboard view or `mc:show_leaderboard`'s display directive (MILESTONE-09/10 — `RoomState.display` stays untouched, same posture as MILESTONE-07); `mc:end`/event finalisation and `event_final_*` (MILESTONE-10); replaying a missed `step_results`/`rankings`/`own_result` broadcast to a client that reconnects after the fact (MILESTONE-14's reconnect-hardening scope — see Risks); the 10-client scripted-scenario harness against hand-calculated scores (FR-087, a separate later milestone, not part of MILESTONE-08's own acceptance criteria).

## Decisions

### D1: Late-joiner eligibility (FR-056) needs no new code — it already falls out of the existing architecture

Investigated a stateful approach (compare `participant.joined_at` against the step's `timerStartedAt`) before realizing it's unnecessary: `answer:submit` (MILESTONE-07) only ever accepts an answer for the step that is currently `active`, and a participant cannot exist (let alone submit) before their own `join_event` row is created — so a participant can never hold an answer for any step that closed before they joined. Scoring a step only ever counts participants who actually submitted for *that* step (every other requirement already reduces to "no submission ⇒ 0 points" — FR-052/FR-053's zero-handling). A late joiner therefore automatically starts at 0 (no `step_result_participant` rows exist for steps before they joined) and is automatically eligible from their join step onward (they can submit for it like anyone else). "Play solo, no team join/create" is likewise already enforced by MILESTONE-06's `create_team`/`join_team` RPCs, which reject once `event.status <> 'draft'`.

Verified with a dedicated test (a participant created mid-event, after step 1 is already revealed, is absent from step 1's results and scores normally on step 2) rather than left as an assumption.

### D2: The scoring module is a pure function over a full snapshot, not an incremental accumulator

`scoreStep(input): { participants: ParticipantStepResult[]; teams: TeamStepResult[] }` in `packages/shared/src/scoring.ts` (no Cloudflare/DO import, NFR-017) takes the step's config (`pointsCorrect`, `teamAwardPoints`, `correctOptionId`, `timed`), every accepted answer (`participantId`, `optionId`, `submittedAt`, `receiptSeq`), and the full current participant roster (`id`, `teamId`) — and returns a result row for *every* roster participant/team-with-members, not only submitters, so FR-052/FR-053's "record 0" requirements are explicit rows rather than implied absence.

- `isCorrect` reflects only whether the submitted option matches `correctOptionId` — independent of `points`, so a correct-but-not-fastest timed-step answer is `{ isCorrect: true, points: 0 }`, distinguishable from a wrong answer (`{ isCorrect: false, points: 0 }`) for the player's own result view.
- Timed-step point awarding compares `submittedAt` at millisecond-string equality (FR-049) to find every tied earliest-correct answer — `receiptSeq` is stored (it's Postgres `answer.receipt_seq`, required by the schema and by FR-045) but is **not** used to break a tie for point-awarding, since FR-049 explicitly awards every millisecond-tied correct answer the full points rather than picking one via receipt sequence.
- Team averages/winner comparison use direct floating-point division and comparison (`sumPoints / submitterCount`), not a cross-multiplied exact-rational comparison. **Correction made during implementation**: design originally planned exact-rational comparison to avoid a feared repeating-decimal (e.g. 1/3) float-equality mismatch — verified empirically (`1/3 === 2/6` and `7/21 === 1/3` both `true` in V8) that this isn't a real risk here, because IEEE754 double division is correctly rounded and each team's average is computed via exactly one division, then compared once (not accumulated through multiple lossy operations) — two mathematically-equal small-integer fractions are therefore always bit-identical. Kept the simpler direct comparison instead of unneeded cross-multiplication code.
- A team's winner-eligibility pool is exactly the teams with ≥1 submitting member this step; a zero-submitter team is never a winner regardless of what the winning average turns out to be (FR-052), even on an all-zero step where every submitting team also averages 0 (FR-051 sets no minimum-score threshold to win).

### D3: `mc:reveal` requires the step already be `locked`

SPEC.md's FR-046 ties reveal-eligibility to "the MC triggers the reveal step or when the step timer ends, whichever comes first," which is ambiguous taken alone. Read together with FR-044 ("only an explicit MC command changes the step" beyond the timer's own auto-lock) and the protocol table (`mc:reveal`'s only listed precondition-free effect is "run scoring; ... step → revealed"), the coherent reading is: the answer window must already be closed (by explicit `mc:lock` or timer expiry) before `mc:reveal` can run — `mc:reveal` on a still-`active` step, or with no current step, is rejected (`not_locked`). This mirrors `mc:start`'s "not_draft" and `mc:advance`'s "no_next_step" pattern of explicit, named rejections for an edge SPEC.md's prose leaves implicit (design.md D9, MILESTONE-07).

### D4: Persist-then-transition — the DO only mutates/broadcasts after a successful Postgres flush

Scoring computation happens in memory first (cheap, synchronous, uses only data already fetched). The Postgres flush (new `answer` rows with real `is_correct`/`scored_points`, `step_result_participant`/`step_result_team` rows, and `step.status = 'revealed'`) is attempted with bounded retry (3 attempts, exponential backoff: 200ms/400ms/800ms) *before* the DO's own `RoomState` is mutated to `revealed` or anything is broadcast. If every attempt fails, `mc:reveal` sends the controller a `reveal_failed` error and leaves the step `locked` — the controller can simply retry `mc:reveal` again, and nothing has been broadcast to players in the meantime. This keeps NFR-014's guarantee intact (no committed result exists only in DO memory) without needing a rollback path: there's nothing to roll back, since DO state was never mutated on failure.

Backoff uses `await`ed timers, not a busy loop — the DO's single-threaded async runtime can still interleave other connections' messages (e.g., a `ping` or an unrelated read) while a `mc:reveal` retry is waiting, satisfying "does not stall the live flow" structurally rather than by special-casing concurrency.

**Alternative considered**: a Postgres RPC wrapping the whole flush in one transaction (atomicity across `answer`/`step_result_*`/`step` in a single round trip). Rejected for this milestone — supabase-js's REST interface makes multi-table transactional RPCs meaningfully more code (a new Postgres function + migration) for a PoC-scale (≤10 participants, single-digit steps) flush where partial-write inconsistency during a brief retry window is an acceptable, easily-reconciled trade-off; revisit if MILESTONE-14's resilience hardening needs it.

### D5: Rankings are recomputed fresh from Postgres on every reveal, not accumulated in DO memory

After a successful flush, `mc:reveal` queries every `step_result_participant`/`step_result_team` row for the event so far (joined to `step` for the `event_id` filter, no new RPC — PostgREST's embedded-resource filter, e.g. `step_result_participant.select("participant_id, points, step!inner(event_id)").eq("step.event_id", eventId)`) and sums client-side (JS `reduce`) rather than relying on a DO-local running total. This makes rankings correct even after a DO restart mid-event (NFR-014's recovery-point guarantee) without needing MILESTONE-14's fuller rehydration work — Postgres is already the source of truth for every committed step by the time rankings are computed. At this project's scale (≤10 participants, single-digit steps) the full re-scan is a handful of rows; not a design to keep at 500 participants, matching NFR-001's stated non-goal of *structurally* blocking that scale-up (a future optimization, not required now).

Rank is assigned by standard competition ranking (ties share a rank; the next distinct value skips accordingly, e.g. 1,1,3) — SPEC.md's `rankings` message shape includes a `rank` field but doesn't pin tie-break semantics; recorded here as a reasonable default rather than left undecided.

### D6: Pre-existing gap acknowledged, not fixed here: `step.status`/`event.current_step_id` in Postgres

MILESTONE-07 never synced `step.status`/`step.timer_started_at`/`event.current_step_id` to Postgres for `active`/`locked` — the DO's own `RoomState` is the sole runtime authority until now. This milestone's `mc:reveal` writes `step.status = 'revealed'` (needed for consistency with the rows it writes and useful groundwork for recovery), but does **not** retroactively backfill `active`/`locked` syncing or start maintaining `event.current_step_id` — that's unrelated to this milestone's job and stays a known gap for MILESTONE-14 (resilience/recovery) to address deliberately, not as a side effect here.

## Risks / Trade-offs

- [Risk] A client that disconnects during `mc:reveal` and reconnects afterward never receives that step's `step_results`/`rankings`/`own_result` (they're one-shot broadcasts, not part of the persistent `state` snapshot) → Mitigation: explicitly out of scope (FR-085's reconnect-correctness FR is MILESTONE-14's), and narrow in practice — the player's `LiveGameView` still shows the correct *input-disabled* state from `state` alone; only the result display is missed until the next step's own messages arrive.
- [Risk] The full-rescan rankings query (D5) does one Postgres round trip per reveal, growing linearly with step count → Mitigation: acceptable at this project's ≤10-participant, single-digit-step PoC scale; the query shape (a filtered select, no custom aggregation) leaves room to swap in a materialized/incremental approach later without changing the broadcast shape.
- [Risk] Direct floating-point comparison of team averages could in principle mis-tie-break on a repeating decimal → Mitigation: verified not a real risk for this computation shape (single correctly-rounded division per team, compared once — see D2's correction); covered by a dedicated test asserting a 1/3-vs-2/6-shaped tie is detected correctly.

## Migration Plan

1. `packages/shared`: new `scoring.ts` (`scoreStep` + its input/output types); `protocol.ts` gains `McRevealCommand`, `StepResultsMessage`, `RankingsMessage`, `OwnResultMessage`.
2. `apps/party`: `EventRoom.ts` gains the `mc:reveal` handler, a small retry-with-backoff helper, the rankings query, and the `reveal_failed` error path.
3. `apps/party/test/eventroom.test.ts`: extend with `mc:reveal` scenarios (happy path, non-controller, not-locked, repeated-reveal, zero-submitter step, timed-tie, team-mean/winner, late-joiner, transient-Postgres-failure-then-retry-succeeds).
4. `packages/shared/src/scoring.test.ts`: unit coverage of every scoring branch via fixture inputs (untimed, timed-fastest, timed-tie, team mean, team-tie-winners, team-no-submitters, event-wide zero-answer step, rank computation with ties).
5. `apps/web`: `LiveGameView` gains the result view (own_result-driven); new FR/EN copy.
6. No new Postgres migration — existing MILESTONE-02 schema already fits.
7. Rollback: additive to `apps/party`/`apps/web`/`packages/shared` only — a plain `git revert`; no data migration (this milestone writes real rows to already-existing tables, not a schema change).

## Open Questions

None — FR-046's reveal-precondition ambiguity (D3), the late-joiner question (D1), and the rank tie-break (D5) are resolved above rather than left open.
