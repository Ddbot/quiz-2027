## Context

Every mechanism this milestone exercises already exists and is already unit/integration-tested in isolation: `join_event`/`create_team` (MILESTONE-03/06), the full `mc:start`→`mc:lock`→`mc:reveal`→`mc:show_leaderboard`→`mc:advance`→`mc:end` flow (MILESTONE-07/08/09/10), `scoreStep`/`rankByTotal` (MILESTONE-08, `packages/shared/src/scoring.ts`), and DO-restart survival (MILESTONE-05/14, both already manually verified with a real `wrangler dev` process-tree restart). This milestone's job is not to build new mechanisms but to run all of them together, once, for real, and write down what happened.

`apps/party/test/eventroom.test.ts`'s `"propagation timing (FR-031 acceptance)"` suite already asserts a state change reaches 10 connected clients within 2 seconds — that test exists and passes today; this milestone's report cites it rather than re-proving the same thing a second way.

## Goals / Non-Goals

**Goals:**
- A harness that is genuinely repeatable in CI (FR-087's own literal acceptance criterion), not a one-off script.
- Hand-calculated expected scores a reader can verify by inspection, not just trust.
- A report that honestly separates what's been demonstrated from what only the owner can confirm (G-5).

**Non-Goals:**
- New product behavior — `skip_specs: true`, see proposal.md.
- Wiring Playwright into CI (confirmed with the owner — see D1).
- Re-deriving tie-break edge cases already covered exhaustively at the unit level in `packages/shared/src/scoring.test.ts` — this harness's scenario stays simple on purpose (D4).
- Asserting G-5 (zero spend) — genuinely not verifiable by reading code; explicitly deferred to the owner in the report (D5).

## Decisions

### D1: Playwright is local/manual, not a CI job

Confirmed with the owner directly (AskUserQuestion) before scoping: only the harness is explicitly required to be CI-repeatable (FR-087). Running Playwright in CI would mean starting the Worker, the web dev server, and Supabase together in that job — a real jump in CI complexity and runtime for a requirement SPEC.md never actually mandates running automatically. The spec is written, run locally as part of this milestone's own verification, and its result is recorded in the report.

### D2: The harness spawns a real `wrangler dev`, not the in-process test-pool

SPEC.md's tech stack table calls this "a Node partysocket harness" — the real `partysocket` client library used by `apps/web` itself, connecting over a real network socket. That needs a real server to connect to; `@cloudflare/vitest-pool-workers` (what `apps/party`'s own test suite uses) runs everything in-process via `SELF.fetch` and isn't a real listening server a standalone `partysocket` client could connect to. The harness spawns `wrangler dev` as a child process, waits for its "Ready on http://127.0.0.1:PORT" log line, runs the scripted scenario, and tears down the *entire* process tree on exit — success or failure — reusing the exact approach already proven manually during MILESTONE-14's close-out (`taskkill /F /T` on Windows; `process.kill(-pid, "SIGTERM")` against a detached process group on POSIX, since CI runs `ubuntu-latest`).

### D3: Fixture participants join via real RPCs, not direct Postgres inserts

`join_event`/`create_team`/`join_team` are called for real, through the anon-key client (not the service-role admin bypass `tools/db`'s own fixtures use for speed) — the whole point of this milestone is validating the real onboarding path end-to-end (G-2), not just seeding rows. The *event and its steps* are still created via the admin/service-role client, matching every other milestone's fixture convention — there's no "real" authoring path worth exercising here beyond what MILESTONE-04's own tests already cover, and admin authoring isn't part of G-2's player-facing happy path.

### D4: A hand-verifiable scripted scenario, chosen for clean arithmetic over edge-case coverage

10 participants: P1–P4 form Team Alpha, P5–P7 form Team Beta, P8–P9 are solo, P10 is solo and joins only *after* step 1 is revealed (the late joiner — an ordinary `join_event` call while the event is already `live`, nothing special). 6 anonymous identities, 4 account identities, distributed across both teams and solo so neither grouping correlates with identity type.

Three steps, correct option always `"a"`:
- **Step 1** (untimed, `pointsCorrect: 10`, `teamAwardPoints: 6`): P1, P2, P5, P6, P8 answer correctly; P9 answers incorrectly; P3, P4, P7 don't answer at all (not submitters — team-averaging only counts participants who actually submitted something, right or wrong); P10 doesn't exist yet. Team Alpha's submitters are {P1, P2}, both correct, mean 10. Team Beta's submitters are {P5, P6}, both correct, mean 10 — a tie, so **both teams win step 1** (per `scoreStep`'s existing tied-team-full-award rule, already built in MILESTONE-08).
- **Step 2** (timed, `pointsCorrect: 10`, `teamAwardPoints: 6`): P1 submits correct and first — sent, acknowledged, and given a short pause before anyone else submits, so "fastest" is unambiguous over a real network rather than relying on millisecond-tie luck. Every other correct answer (P2, P3, P5, P8, P10) is correct but not fastest, so scores 0 under FR-049's fastest-correct-only rule; P4, P6, P9 answer incorrectly; P7 doesn't answer. Team Alpha's submitters are {P1, P2, P3, P4}, sum 10, mean 2.5; Team Beta's submitters are {P5, P6}, sum 0, mean 0 — Alpha wins outright.
- **Step 3** (untimed, `pointsCorrect: 10`, `teamAwardPoints: 0` — deliberately zero, to exercise "a step with no team bonus at all"): P1, P3, P4, P6, P7, P9, P10 answer correctly; P2, P5, P8 answer incorrectly. No team points are awarded this step regardless of who has the better average, since `teamAwardPoints` is 0.

Hand-calculated final individual totals: P1=30, P6=20, everyone else (P2, P3, P4, P5, P7, P8, P9, P10) =10 — an eight-way tie at rank 3 behind P1 (rank 1) and P6 (rank 2), a real (if simple) exercise of standard competition ranking's tie-skip behavior. Hand-calculated final team totals: Alpha = 6 (step 1) + 6 (step 2) + 0 (step 3) = **12**, rank 1; Beta = 6 (step 1) + 0 (step 2) + 0 (step 3) = **6**, rank 2.

### D5: The report states G-5 as owner-confirmed, not self-asserted

Whether real infrastructure spend is €0 can only be answered by checking the actual Cloudflare/Supabase/Vercel billing dashboards — nothing in this repository can confirm or deny it. The report's G-5 section is written as a question for the owner, asked directly (the same way every production-touching confirmation already works in this project), not filled in with an assumed "yes."

### D6: The CI step reuses the existing job's Supabase setup; no duplication

`.github/workflows/ci.yml`'s `verify` job already starts local Supabase and writes `apps/party/.dev.vars` before its `Test` step runs. The harness step is added immediately after `Test`, in the same job, reusing that same running Supabase instance and `.dev.vars` file — no second Supabase start, no separate job/workflow.

## Risks / Trade-offs

- [`wrangler dev` startup time adds to CI runtime] → Accepted; it's one more step in an already-multi-minute job, and FR-087 explicitly requires the harness to run in CI regardless of the cost.
- [A real network-timing "fastest" answer could theoretically be flaky under CI load] → Mitigated by D4's explicit ack-then-pause-then-others sequencing, not relying on submission order alone.
- [Playwright's local-only scope means it never re-runs automatically after this milestone] → Accepted per the owner's own confirmed decision (D1); the harness remains the CI-enforced regression guard for the underlying protocol/scoring behavior Playwright's spec exercises at the UI layer.

## Migration Plan

No schema change, no migration. New dev-only package and CI step; ships as a normal PR like every other milestone's.
