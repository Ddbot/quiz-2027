// Framework-agnostic scoring rules (NFR-017 — no Cloudflare/DO import).
// Turns a step's accepted answers into per-participant/per-team results.
// See openspec/changes/scoring-engine-persistence/design.md.

/** One accepted answer, as read from the Durable Object's local SQLite table. */
export interface ScoringAnswer {
  participantId: string;
  optionId: string;
  /** Server receipt time (ISO 8601, millisecond precision — FR-049's tie basis). */
  submittedAt: string;
  /** The DO's local monotonic receipt sequence (FR-045) — Postgres `answer.receipt_seq`. */
  receiptSeq: number;
}

/** A roster member as scoring needs to know them — every event participant, not only submitters. */
export interface ScoringParticipant {
  id: string;
  teamId: string | null;
}

/** A step's scoring configuration and the data to score it against. */
export interface StepScoringInput {
  timed: boolean;
  pointsCorrect: number;
  teamAwardPoints: number;
  correctOptionId: string;
  answers: ScoringAnswer[];
  /** The event's full current participant roster (design.md D1/D2 — every roster member gets a result). */
  participants: ScoringParticipant[];
}

export interface ParticipantStepResult {
  participantId: string;
  /** Whether their submitted option was correct — independent of `points` (design.md D2). */
  isCorrect: boolean;
  points: number;
}

export interface TeamStepResult {
  teamId: string;
  avgScore: number;
  isWinner: boolean;
  awardedPoints: number;
}

export interface StepScoringResult {
  participants: ParticipantStepResult[];
  teams: TeamStepResult[];
}

/**
 * Scores one step (FR-047..FR-053). Every roster participant gets a result
 * row (0 points if they didn't submit or answered wrong — FR-052/FR-053
 * need no separate zero-handling branch, it's the same fallthrough); every
 * team with at least one roster member gets a result row, but only teams
 * with at least one *submitting* member are eligible to win (FR-052).
 */
export function scoreStep(input: StepScoringInput): StepScoringResult {
  const { timed, pointsCorrect, teamAwardPoints, correctOptionId, answers, participants } = input;

  const answerByParticipant = new Map(answers.map((a) => [a.participantId, a]));

  // Timed steps: only the earliest correct answer(s) score — ties at
  // millisecond-string equality all score in full (FR-049). `receiptSeq` is
  // carried through to callers (it's required by the Postgres `answer`
  // schema) but is deliberately not used to break this tie.
  let earliestCorrectMs: number | null = null;
  if (timed) {
    for (const a of answers) {
      if (a.optionId !== correctOptionId) continue;
      const ms = Date.parse(a.submittedAt);
      if (earliestCorrectMs === null || ms < earliestCorrectMs) earliestCorrectMs = ms;
    }
  }

  const participantResults: ParticipantStepResult[] = participants.map((p) => {
    const answer = answerByParticipant.get(p.id);
    if (!answer) return { participantId: p.id, isCorrect: false, points: 0 };

    const isCorrect = answer.optionId === correctOptionId;
    if (!isCorrect) return { participantId: p.id, isCorrect: false, points: 0 };
    if (!timed) return { participantId: p.id, isCorrect: true, points: pointsCorrect };

    const isFastestTier = earliestCorrectMs !== null && Date.parse(answer.submittedAt) === earliestCorrectMs;
    return { participantId: p.id, isCorrect: true, points: isFastestTier ? pointsCorrect : 0 };
  });

  const pointsByParticipant = new Map(participantResults.map((r) => [r.participantId, r.points]));
  const submitterIds = new Set(answers.map((a) => a.participantId));

  const teamMemberIds = new Map<string, string[]>();
  for (const p of participants) {
    if (!p.teamId) continue;
    const members = teamMemberIds.get(p.teamId) ?? [];
    members.push(p.id);
    teamMemberIds.set(p.teamId, members);
  }

  interface TeamTotals {
    teamId: string;
    submitterCount: number;
    sumPoints: number;
  }
  const teamTotals: TeamTotals[] = [...teamMemberIds.entries()].map(([teamId, memberIds]) => {
    const submitting = memberIds.filter((id) => submitterIds.has(id));
    const sumPoints = submitting.reduce((sum, id) => sum + (pointsByParticipant.get(id) ?? 0), 0);
    return { teamId, submitterCount: submitting.length, sumPoints };
  });

  // Winner-eligibility pool: teams with at least one submitting member
  // (FR-052 — a zero-submitter team never wins, even on an all-zero step).
  const eligible = teamTotals.filter((t) => t.submitterCount > 0);
  const winnerIds = new Set<string>();
  if (eligible.length > 0) {
    const bestAvg = Math.max(...eligible.map((t) => t.sumPoints / t.submitterCount));
    for (const t of eligible) {
      if (t.sumPoints / t.submitterCount === bestAvg) winnerIds.add(t.teamId);
    }
  }

  const teamResults: TeamStepResult[] = teamTotals.map((t) => {
    const isWinner = winnerIds.has(t.teamId);
    return {
      teamId: t.teamId,
      avgScore: t.submitterCount > 0 ? t.sumPoints / t.submitterCount : 0,
      isWinner,
      awardedPoints: isWinner ? teamAwardPoints : 0,
    };
  });

  return { participants: participantResults, teams: teamResults };
}

/** One entry in a cumulative ranking, before rank numbers are assigned. */
export interface RankableTotal {
  id: string;
  total: number;
}

export interface RankedEntry {
  id: string;
  total: number;
  /** Standard competition ranking — ties share a rank, the next distinct value skips accordingly (design.md D5). */
  rank: number;
}

/** Ranks entries by descending total using standard competition ranking (1224 style). */
export function rankByTotal(entries: RankableTotal[]): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => b.total - a.total);
  const ranked: RankedEntry[] = [];
  sorted.forEach((entry, index) => {
    const rank = index > 0 && sorted[index - 1]!.total === entry.total ? ranked[index - 1]!.rank : index + 1;
    ranked.push({ id: entry.id, total: entry.total, rank });
  });
  return ranked;
}
