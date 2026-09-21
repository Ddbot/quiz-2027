// Hand-calculated expected final scores (design.md D4) — computed
// independently by working through packages/shared/src/scoring.ts's rules
// by hand against the exact scripted answers in scenario.ts, never by
// calling scoreStep/rankByTotal. If this file and the real scoring engine
// ever disagree, that's the regression this harness exists to catch.
//
// Step 1 (untimed, 10 pts, 6 team pts): p1/p2/p5/p6/p8 correct, p9
// incorrect, p3/p4/p7 don't answer, p10 doesn't exist yet.
//   Team Alpha submitters {p1, p2}, both correct -> mean 10.
//   Team Beta submitters {p5, p6}, both correct -> mean 10.
//   Tie -> both teams win step 1's 6 points.
// Step 2 (timed, 10 pts, 6 team pts): p1 correct AND fastest (only scorer);
// p2/p3/p5/p8/p10 correct but not fastest (0 under fastest-correct-only);
// p4/p6/p9 incorrect; p7 doesn't answer.
//   Team Alpha submitters {p1, p2, p3, p4}, sum 10, mean 2.5.
//   Team Beta submitters {p5, p6}, sum 0, mean 0.
//   Alpha wins step 2's 6 points outright.
// Step 3 (untimed, 10 pts, 0 team pts): p1/p3/p4/p6/p7/p9/p10 correct;
// p2/p5/p8 incorrect. team_award_points is 0 this step, so no team points
// either way.

export const EXPECTED_INDIVIDUAL_TOTALS: Record<string, { total: number; rank: number }> = {
  p1: { total: 30, rank: 1 },
  p2: { total: 10, rank: 3 },
  p3: { total: 10, rank: 3 },
  p4: { total: 10, rank: 3 },
  p5: { total: 10, rank: 3 },
  p6: { total: 20, rank: 2 },
  p7: { total: 10, rank: 3 },
  p8: { total: 10, rank: 3 },
  p9: { total: 10, rank: 3 },
  p10: { total: 10, rank: 3 },
};

export const EXPECTED_TEAM_TOTALS = {
  alpha: { total: 12, rank: 1 },
  beta: { total: 6, rank: 2 },
};
