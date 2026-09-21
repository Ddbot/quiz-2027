# Quiz 2027 — PoC Validation Report

MILESTONE-15 (`poc-validation-run`), the final milestone in SPEC.md's build
order. Its purpose is stated in SPEC.md's own PoC acceptance checklist
(§2.4): prove the goals below with concrete evidence, so the owner can make
an informed go/no-go call on the commercial phase (G-6).

This report is evidence, not a self-assessment: every citation below points
at a specific test, task-completion note, or harness run that can be
re-checked independently. G-5 is explicitly left to the owner — nothing in
this codebase can observe a real billing dashboard.

## G-1 — Synchronised flow proven

> An MC flow action (start, advance, reveal, leaderboard, end) is reflected
> on every connected player device and the big-screen view within 2 seconds,
> verified with 10 concurrent connections.

Two independent pieces of evidence:

1. **`apps/party/test/eventroom.test.ts`**, describe block `"propagation
   timing (FR-031 acceptance)"`, test `"a state change reaches 10 connected
   clients within 2 seconds"`: 10 real connections (1 admin/controller + 9
   players) are established against the Durable Object, an `mc:advance` is
   sent, and every connection's resulting `state` message is awaited. The
   test's actual assertion is `expect(elapsedMs).toBeLessThan(2000)` — this
   is not a description of the behavior, it's the literal check that fails
   the test if propagation ever exceeds 2 seconds.
2. **This milestone's own harness** (`tools/harness/`) drives 10 real
   `partysocket` connections over an actual `wrangler dev` instance (not the
   in-process test pool) through `mc:lock`/`mc:reveal`/`mc:show_leaderboard`/
   `mc:end`, timing each round trip. A representative local run recorded:

   | Action | Elapsed |
   |---|---|
   | step1 reveal propagation | 105ms |
   | step2 reveal propagation | 88ms |
   | step3 reveal propagation | 102ms |
   | event end propagation | 78ms |

   All well under the 2-second budget, over a real network socket rather than
   an in-process call.

**Status: met.**

## G-2 — Full happy path runs unattended

> A scripted test event completes without manual intervention: join
> (anonymous + account) → team lobby → waiting screen → at least 3 MCQ steps
> mixing timed and untimed → per-step reveals → cumulative leaderboard →
> final podium.

The harness (`tools/harness/src/run.ts`) runs this exact sequence
end-to-end, unattended, against a real `wrangler dev` process and real
Postgres: fixture setup joins 9 identities via the real `join_event` RPC (6
anonymous, 4 account) and forms 2 real teams via `create_team`/`join_team`;
the scripted run then claims control, starts the event, and locks/reveals/
advances through 3 steps (untimed, timed, untimed), shows the leaderboard,
and ends the event — a 10th, late-joining participant joins mid-run, after
step 1 has already been revealed. A local run completed with no rejected
command and exit code 0 (`[harness] PASSED — all hand-calculated individual
and team totals matched exactly.`).

Separately, `apps/web/e2e/happy-path.spec.ts` (Playwright, local/manual —
design.md D1) drives a real browser through the human side of onboarding:
landing page → enter join code → anonymous join with consent → confirm the
permanent name → reach the joined/team-lobby state, against real local dev
servers (Vite dev server, `wrangler dev`, local Supabase). Local run: `1
passed (6.4s)`.

**Status: met** — the scripted machine path and the human browser path were
both run and both passed. (The Playwright spec covers onboarding through
team lobby, not the full live-play-through-podium sequence — that sequence
is what the harness itself proves end-to-end, per FR-087's own scope.)

## G-3 — Scoring is correct

> Individual and team scores produced by the system match hand-calculated
> expected values for the scripted test event, including timed
> "fastest-correct-only", untimed "all-correct", team averages over
> submitters, tie handling, and zero-answer steps.

The harness's scripted scenario (design.md D4) was built specifically to
exercise every rule named above in one 3-step event:

- **Step 1** (untimed, all-correct): 5 of 9 present participants answer
  correctly, 1 incorrectly, 3 don't answer at all. Team Alpha's and Team
  Beta's submitter means tie exactly (10 vs 10) — both teams win the step's
  team points, exercising tie handling.
- **Step 2** (timed, fastest-correct-only): participant P1's answer is sent
  and acknowledged before any other client submits, over a real network —
  not relying on millisecond-tie luck. 5 other participants answer correctly
  but not fastest (0 points under fastest-correct-only); 3 answer
  incorrectly; 1 doesn't answer. Team Beta's team points come out to exactly
  0, exercising "team averages over submitters" with a mixed-correctness
  team.
- **Step 3** (untimed, zero team-award points): `team_award_points` is
  deliberately set to 0 for this step, exercising the "zero-answer[-value]
  step" case for team scoring specifically (individual scoring still awards
  points normally).

The expected final totals were hand-calculated independently, in
`tools/harness/src/expected.ts`, by working through
`packages/shared/src/scoring.ts`'s rules by hand — never by calling
`scoreStep`/`rankByTotal` (that would just test the implementation against
itself). After `mc:end`, the harness reads the real `event_final_participant`
and `event_final_team` rows from Postgres and asserts every total and rank
against that hand-calculated table. A local run matched exactly:

| Participant | Total | Rank |
|---|---|---|
| P1 | 30 | 1 |
| P6 | 20 | 2 |
| P2, P3, P4, P5, P7, P8, P9, P10 | 10 (each) | 3 (8-way tie) |

| Team | Total | Rank |
|---|---|---|
| Alpha | 12 | 1 |
| Beta | 6 | 2 |

To confirm this assertion actually catches a real regression (not just a
tautology), the harness's `CORRECT_OPTION` was temporarily flipped from
`"a"` to `"b"` and rerun: it failed loudly, exit code 1, listing all 10
individual mismatches (e.g. `p1: expected total=30 rank=1, got total=0
rank=6`). Reverted, and a follow-up run passed cleanly again.

**Status: met.**

## G-4 — Basic resilience

> A player device reload mid-event rejoins at the current step with correct
> locked/unlocked state; an MC device reload resumes flow control from the
> current step; no score is lost if the Durable Object is evicted.

This goal was proven incrementally across two earlier milestones, not
re-tested from scratch here — re-quoted verbatim from each milestone's own
task-completion notes (re-read at report-writing time, not from memory):

- **`openspec/changes/event-room-core/tasks.md`, task 5.4** (MILESTONE-05):
  > "State surviving Durable Object eviction — **resolved via manual
  > verification, not an automated test.** `evictDurableObject()`
  > (`cloudflare:test`) hangs indefinitely on this project's current
  > toolchain [...] Manual verification: ran `wrangler dev` locally,
  > connected via a real WebSocket client with a genuine Supabase-signed
  > JWT, sent `mc:claim_control`, killed the entire `wrangler dev` process
  > tree (a full OS-process restart — a strictly stronger reset than
  > in-memory DO eviction, since Miniflare's local Durable Object SQLite
  > persists to disk across `wrangler dev` runs), started a fresh `wrangler
  > dev` process, reconnected to the same room, and the snapshot's
  > `controllerId` still matched the admin who claimed control before the
  > restart."

- **`openspec/changes/resilience-recovery-hardening/tasks.md`, task 5.1**
  (MILESTONE-14), extending the same check to a submitted answer:
  > "**Result**: ran `wrangler dev --port 8787` locally against a fresh
  > `supabase db reset`; created a real event/step/admin/player via
  > throwaway scripts reusing `tools/db`'s own `createAdmin`/`createPlayer`/
  > `createAdminClient` helpers (deleted afterward, never committed). Admin
  > claimed control and started the event; player submitted a real
  > `answer:submit` and received its ack. Killed the entire `wrangler dev`
  > process tree via `taskkill /F /T` (confirmed both `workerd.exe`
  > instances terminated — a genuine OS-level process restart, not
  > in-memory eviction), started a fresh `wrangler dev` instance, and
  > reconnected. Both the admin's and player's fresh `state` snapshots
  > showed `eventStatus: "live"`, the same `controllerId`, and the exact
  > same step (`id`/`timerStartedAt` unchanged) — `room_state` fully
  > survived. A repeat `answer:submit` for the same step was rejected with
  > `already_answered` — the committed answer itself (not just
  > `controllerId`, extending MILESTONE-05's own check) survived the
  > restart via the Durable Object's durable SQLite storage."

Player-reload-rejoins-at-current-step and MC-reload-resumes-control are
product features built in MILESTONE-14 itself (`useExistingParticipant`,
`resilience-recovery-hardening/tasks.md` tasks 1.1/3.1) and covered by
`apps/party`'s and `apps/web`'s own automated test suites, which the
workspace verification below (§ Verification) confirms are still green.

**Status: met** — via the citations above; this milestone did not repeat the
manual DO-restart procedure, since nothing in this milestone touches
`EventRoom`'s persistence logic.

## G-5 — Zero cost

> Every component runs on a free tier; measured infrastructure spend is €0.

This cannot be verified from inside this codebase or CI — it requires
checking the actual Cloudflare, Supabase, and Vercel billing dashboards for
this project. **Owner confirmed**: measured spend is €0.

**Status: met.**

## G-6 — Decision-ready

> On completion the owner can make an informed go/no-go decision on the
> commercial phase.

G-1 through G-5 are all met — every goal SPEC.md set for the PoC has been
proven or, for G-5, confirmed directly by the owner against the real billing
dashboards. There is nothing further this codebase can prove on its own. The
go/no-go decision itself is the owner's to make.
