import { describe, expect, it } from "vitest";

import { rankByTotal, scoreStep, type ScoringParticipant } from "./scoring.js";

const T0 = "2026-09-15T00:00:00.000Z";
const T1 = "2026-09-15T00:00:01.000Z";

describe("scoreStep", () => {
  describe("untimed steps (FR-047)", () => {
    it("awards every correct answer the full points, with no speed advantage", () => {
      const participants: ScoringParticipant[] = [
        { id: "p1", teamId: null },
        { id: "p2", teamId: null },
        { id: "p3", teamId: null },
      ];
      const result = scoreStep({
        timed: false,
        pointsCorrect: 5,
        teamAwardPoints: 3,
        correctOptionId: "a",
        answers: [
          { participantId: "p1", optionId: "a", submittedAt: T1, receiptSeq: 2 },
          { participantId: "p2", optionId: "a", submittedAt: T0, receiptSeq: 1 },
          { participantId: "p3", optionId: "b", submittedAt: T0, receiptSeq: 3 },
        ],
        participants,
      });

      expect(result.participants).toEqual(
        expect.arrayContaining([
          { participantId: "p1", isCorrect: true, points: 5 },
          { participantId: "p2", isCorrect: true, points: 5 },
          { participantId: "p3", isCorrect: false, points: 0 },
        ]),
      );
    });
  });

  describe("timed steps (FR-048/FR-049)", () => {
    it("awards points only to the earliest correct answer", () => {
      const participants: ScoringParticipant[] = [
        { id: "p1", teamId: null },
        { id: "p2", teamId: null },
      ];
      const result = scoreStep({
        timed: true,
        pointsCorrect: 5,
        teamAwardPoints: 3,
        correctOptionId: "a",
        answers: [
          { participantId: "p1", optionId: "a", submittedAt: T1, receiptSeq: 1 },
          { participantId: "p2", optionId: "a", submittedAt: T0, receiptSeq: 2 },
        ],
        participants,
      });

      expect(result.participants).toEqual(
        expect.arrayContaining([
          { participantId: "p1", isCorrect: true, points: 0 },
          { participantId: "p2", isCorrect: true, points: 5 },
        ]),
      );
    });

    it("awards every millisecond-tied earliest correct answer in full, ignoring receiptSeq", () => {
      const participants: ScoringParticipant[] = [
        { id: "p1", teamId: null },
        { id: "p2", teamId: null },
      ];
      const result = scoreStep({
        timed: true,
        pointsCorrect: 5,
        teamAwardPoints: 3,
        correctOptionId: "a",
        answers: [
          // p1 has the later receiptSeq but the identical timestamp — must still tie.
          { participantId: "p1", optionId: "a", submittedAt: T0, receiptSeq: 99 },
          { participantId: "p2", optionId: "a", submittedAt: T0, receiptSeq: 1 },
        ],
        participants,
      });

      expect(result.participants).toEqual(
        expect.arrayContaining([
          { participantId: "p1", isCorrect: true, points: 5 },
          { participantId: "p2", isCorrect: true, points: 5 },
        ]),
      );
    });

    it("distinguishes correct-but-not-fastest from a wrong answer via isCorrect", () => {
      const result = scoreStep({
        timed: true,
        pointsCorrect: 5,
        teamAwardPoints: 3,
        correctOptionId: "a",
        answers: [
          { participantId: "fast", optionId: "a", submittedAt: T0, receiptSeq: 1 },
          { participantId: "slow-correct", optionId: "a", submittedAt: T1, receiptSeq: 2 },
          { participantId: "wrong", optionId: "b", submittedAt: T0, receiptSeq: 3 },
        ],
        participants: [
          { id: "fast", teamId: null },
          { id: "slow-correct", teamId: null },
          { id: "wrong", teamId: null },
        ],
      });

      expect(result.participants).toEqual(
        expect.arrayContaining([
          { participantId: "fast", isCorrect: true, points: 5 },
          { participantId: "slow-correct", isCorrect: true, points: 0 },
          { participantId: "wrong", isCorrect: false, points: 0 },
        ]),
      );
    });
  });

  describe("team scoring (FR-050/FR-051/FR-052)", () => {
    it("computes a team's score as the mean of only its submitting members", () => {
      const participants: ScoringParticipant[] = [
        { id: "p1", teamId: "t1" },
        { id: "p2", teamId: "t1" },
        { id: "p3", teamId: "t1" }, // does not submit
      ];
      const result = scoreStep({
        timed: false,
        pointsCorrect: 4,
        teamAwardPoints: 10,
        correctOptionId: "a",
        answers: [
          { participantId: "p1", optionId: "a", submittedAt: T0, receiptSeq: 1 },
          { participantId: "p2", optionId: "b", submittedAt: T0, receiptSeq: 2 },
        ],
        participants,
      });

      // p1 correct (4), p2 incorrect (0); mean over the two submitters = 2.
      expect(result.teams).toEqual([{ teamId: "t1", avgScore: 2, isWinner: true, awardedPoints: 10 }]);
    });

    it("awards the full step award to every tied-winner team", () => {
      const participants: ScoringParticipant[] = [
        { id: "p1", teamId: "t1" },
        { id: "p2", teamId: "t2" },
      ];
      const result = scoreStep({
        timed: false,
        pointsCorrect: 4,
        teamAwardPoints: 10,
        correctOptionId: "a",
        answers: [
          { participantId: "p1", optionId: "a", submittedAt: T0, receiptSeq: 1 },
          { participantId: "p2", optionId: "a", submittedAt: T0, receiptSeq: 2 },
        ],
        participants,
      });

      expect(result.teams).toEqual(
        expect.arrayContaining([
          { teamId: "t1", avgScore: 4, isWinner: true, awardedPoints: 10 },
          { teamId: "t2", avgScore: 4, isWinner: true, awardedPoints: 10 },
        ]),
      );
    });

    it("excludes a team with no submitting member from winning and records it as 0", () => {
      const participants: ScoringParticipant[] = [
        { id: "p1", teamId: "t1" }, // submits and wins
        { id: "p2", teamId: "t2" }, // never submits
      ];
      const result = scoreStep({
        timed: false,
        pointsCorrect: 4,
        teamAwardPoints: 10,
        correctOptionId: "a",
        answers: [{ participantId: "p1", optionId: "a", submittedAt: T0, receiptSeq: 1 }],
        participants,
      });

      expect(result.teams).toEqual(
        expect.arrayContaining([
          { teamId: "t1", avgScore: 4, isWinner: true, awardedPoints: 10 },
          { teamId: "t2", avgScore: 0, isWinner: false, awardedPoints: 0 },
        ]),
      );
    });

    it("detects a tie between repeating-decimal means (design.md D2)", () => {
      // t1: 1 point / 3 submitters = 1/3. t2: 2 points / 6 submitters = 1/3 too.
      const t1Members: ScoringParticipant[] = [
        { id: "a1", teamId: "t1" },
        { id: "a2", teamId: "t1" },
        { id: "a3", teamId: "t1" },
      ];
      const t2Members: ScoringParticipant[] = [
        { id: "b1", teamId: "t2" },
        { id: "b2", teamId: "t2" },
        { id: "b3", teamId: "t2" },
        { id: "b4", teamId: "t2" },
        { id: "b5", teamId: "t2" },
        { id: "b6", teamId: "t2" },
      ];
      const result = scoreStep({
        timed: false,
        pointsCorrect: 1,
        teamAwardPoints: 7,
        correctOptionId: "a",
        answers: [
          { participantId: "a1", optionId: "a", submittedAt: T0, receiptSeq: 1 }, // 1 point
          { participantId: "a2", optionId: "b", submittedAt: T0, receiptSeq: 2 },
          { participantId: "a3", optionId: "b", submittedAt: T0, receiptSeq: 3 },
          { participantId: "b1", optionId: "a", submittedAt: T0, receiptSeq: 4 }, // 1 point
          { participantId: "b2", optionId: "a", submittedAt: T0, receiptSeq: 5 }, // 1 point (2/6 = 1/3)
          { participantId: "b3", optionId: "b", submittedAt: T0, receiptSeq: 6 },
          { participantId: "b4", optionId: "b", submittedAt: T0, receiptSeq: 7 },
          { participantId: "b5", optionId: "b", submittedAt: T0, receiptSeq: 8 },
          { participantId: "b6", optionId: "b", submittedAt: T0, receiptSeq: 9 },
        ],
        participants: [...t1Members, ...t2Members],
      });

      const t1 = result.teams.find((t) => t.teamId === "t1")!;
      const t2 = result.teams.find((t) => t.teamId === "t2")!;
      expect(t1.isWinner).toBe(true);
      expect(t2.isWinner).toBe(true);
      expect(t1.awardedPoints).toBe(7);
      expect(t2.awardedPoints).toBe(7);
    });
  });

  describe("zero-answer step (FR-053)", () => {
    it("records 0 for every participant and every team when nobody answers", () => {
      const result = scoreStep({
        timed: false,
        pointsCorrect: 4,
        teamAwardPoints: 10,
        correctOptionId: "a",
        answers: [],
        participants: [
          { id: "p1", teamId: "t1" },
          { id: "p2", teamId: "t1" },
        ],
      });

      expect(result.participants).toEqual(
        expect.arrayContaining([
          { participantId: "p1", isCorrect: false, points: 0 },
          { participantId: "p2", isCorrect: false, points: 0 },
        ]),
      );
      expect(result.teams).toEqual([{ teamId: "t1", avgScore: 0, isWinner: false, awardedPoints: 0 }]);
    });
  });

  describe("late-joiner / no-result-row scenarios (design.md D1)", () => {
    it("a participant absent from the roster gets no result row at all", () => {
      const result = scoreStep({
        timed: false,
        pointsCorrect: 4,
        teamAwardPoints: 10,
        correctOptionId: "a",
        answers: [],
        participants: [{ id: "p1", teamId: null }],
      });

      expect(result.participants).toHaveLength(1);
      expect(result.participants[0]!.participantId).toBe("p1");
    });
  });
});

describe("rankByTotal", () => {
  it("ranks strictly descending totals 1, 2, 3", () => {
    const ranked = rankByTotal([
      { id: "a", total: 10 },
      { id: "b", total: 30 },
      { id: "c", total: 20 },
    ]);
    expect(ranked).toEqual([
      { id: "b", total: 30, rank: 1 },
      { id: "c", total: 20, rank: 2 },
      { id: "a", total: 10, rank: 3 },
    ]);
  });

  it("gives tied totals the same rank and skips the next rank accordingly", () => {
    const ranked = rankByTotal([
      { id: "a", total: 10 },
      { id: "b", total: 10 },
      { id: "c", total: 5 },
    ]);
    expect(ranked).toEqual([
      { id: "a", total: 10, rank: 1 },
      { id: "b", total: 10, rank: 1 },
      { id: "c", total: 5, rank: 3 },
    ]);
  });
});
