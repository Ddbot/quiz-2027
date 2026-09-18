import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoomDisplay, RoomQuestion, RoomRankings, RoomStepResults } from "@quiz/shared";

import { BigScreenView } from "@/routes/ScreenViews";
import { getScreenCopy } from "@/routes/screenCopy";

const copy = getScreenCopy("fr");

const question: RoomQuestion = {
  text: "Quelle est la capitale de l'Espagne ?",
  options: [
    { id: "a", label: "Madrid" },
    { id: "b", label: "Paris" },
  ],
};

const stepResults: RoomStepResults = {
  stepId: "step-1",
  participants: [{ participantId: "p-1", isCorrect: true, points: 5 }],
  teams: [],
};

const rankings: RoomRankings = {
  individuals: [{ participantId: "p-1", displayName: "Alice", total: 5, rank: 1 }],
  teams: [{ teamId: "t-1", name: "Team A", total: 5, rank: 1 }],
};

function renderView(display: RoomDisplay, overrides: Partial<Parameters<typeof BigScreenView>[0]> = {}) {
  return render(
    <BigScreenView
      copy={copy}
      display={display}
      question={null}
      stepResults={null}
      rankings={null}
      mediaUrl={null}
      countdownTarget={null}
      killSwitch={false}
      {...overrides}
    />,
  );
}

describe("BigScreenView — 7 required views (FR-062)", () => {
  it("renders a distinct view per display value", () => {
    const testIds: Record<RoomDisplay, string> = {
      waiting: "screen-waiting-view",
      question: "screen-question-view",
      collecting: "screen-collecting-view",
      results: "screen-results-view",
      leaderboard: "screen-leaderboard-view",
      podium: "screen-podium-view",
      blank: "screen-blank-view",
    };

    for (const [display, testId] of Object.entries(testIds) as [RoomDisplay, string][]) {
      const { unmount } = renderView(display, { question, stepResults, rankings });
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("Kill switch overlay (moderation-kill-switch design.md D3)", () => {
  it("blanks the screen regardless of the current display value", () => {
    for (const display of ["waiting", "question", "leaderboard", "podium"] as RoomDisplay[]) {
      const { unmount } = renderView(display, { question, stepResults, rankings, killSwitch: true });
      expect(screen.getByTestId("screen-killswitch-overlay")).toBeInTheDocument();
      expect(screen.queryByTestId(`screen-${display}-view`)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("resumes the current display view once cleared", () => {
    renderView("leaderboard", { rankings, killSwitch: false });
    expect(screen.getByTestId("screen-leaderboard-view")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-killswitch-overlay")).not.toBeInTheDocument();
  });
});

describe("FR-061 — only results/leaderboard show player-entered content", () => {
  it("the waiting view shows no participant/team name", () => {
    renderView("waiting", { mediaUrl: "https://example.com/img.png" });
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Team A")).not.toBeInTheDocument();
  });

  it("the question view shows no participant/team name", () => {
    renderView("question", { question });
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("the collecting view shows no participant/team name", () => {
    renderView("collecting", { question });
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("the blank view shows no player-entered content", () => {
    renderView("blank");
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("the results view may show participant names", () => {
    renderView("results", { stepResults, rankings });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("the leaderboard view may show participant names", () => {
    renderView("leaderboard", { rankings });
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });
});

describe("Leaderboard/podium show both individual and team standings (reveal-leaderboard-end)", () => {
  it("the leaderboard view shows team standings alongside individual ones", () => {
    renderView("leaderboard", { rankings });
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Team A/)).toBeInTheDocument();
  });

  it("the podium view shows team standings alongside individual ones", () => {
    renderView("podium", { rankings });
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Team A/)).toBeInTheDocument();
  });

  it("the teams section is omitted, not shown empty, when the event has no teams", () => {
    renderView("leaderboard", { rankings: { individuals: rankings.individuals, teams: [] } });
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.queryByText(copy.teamsLabel)).not.toBeInTheDocument();
  });
});

describe("Question/collecting/results views never reveal the correct option", () => {
  it("the question view never shows correct_option_id-shaped content", () => {
    const { container } = renderView("question", { question });
    expect(container.innerHTML).not.toContain("correct_option_id");
    expect(container.innerHTML).not.toContain("correctOptionId");
  });

  it("the collecting view never shows correct_option_id-shaped content", () => {
    const { container } = renderView("collecting", { question });
    expect(container.innerHTML).not.toContain("correct_option_id");
  });

  it("the results view shows outcomes without indicating which option was correct", () => {
    renderView("results", { stepResults, rankings });
    // isCorrect/points are shown, but never which optionId was the right one.
    expect(screen.getByTestId("screen-result-participant-p-1")).toHaveTextContent(copy.resultsCorrect);
    expect(screen.queryByText(/optionId/)).not.toBeInTheDocument();
  });
});

describe("Waiting view (FR-064's big-screen half)", () => {
  it("shows the configured waiting-screen image", () => {
    renderView("waiting", { mediaUrl: "https://example.com/waiting.png" });
    expect(screen.getByTestId("screen-waiting-media")).toHaveAttribute("src", "https://example.com/waiting.png");
  });

  it("shows a countdown when a target is configured", () => {
    const future = new Date(Date.now() + 65_000).toISOString();
    renderView("waiting", { countdownTarget: future });
    expect(screen.getByTestId("screen-waiting-countdown")).toBeInTheDocument();
  });
});
