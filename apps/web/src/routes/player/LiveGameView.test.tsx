import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getPlayerCopy } from "@/routes/player/copy";
import { LiveGameView } from "@/routes/player/LiveGameView";
import type { OwnResultMessage, RoomQuestion, RoomStep } from "@quiz/shared";

const copy = getPlayerCopy("fr");

const question: RoomQuestion = {
  text: "2 + 2 = ?",
  options: [
    { id: "a", label: "3" },
    { id: "b", label: "4" },
  ],
};

const activeStep: RoomStep = {
  id: "step-1",
  position: 1,
  timed: true,
  countdownSeconds: 30,
  status: "active",
  timerStartedAt: "2026-09-15T00:00:00.000Z",
};

describe("LiveGameView", () => {
  it("8.1 shows the waiting view when no step is active", () => {
    render(
      <LiveGameView
        copy={copy}
        step={null}
        question={null}
        answerAck={null}
        ownResult={null}
        isExpired={() => false}
        sendCommand={vi.fn()}
      />,
    );
    expect(screen.getByTestId("live-waiting-view")).toBeInTheDocument();
  });

  it("8.1 shows the waiting view for a pending step", () => {
    render(
      <LiveGameView
        copy={copy}
        step={{ ...activeStep, status: "pending" }}
        question={null}
        answerAck={null}
        ownResult={null}
        isExpired={() => false}
        sendCommand={vi.fn()}
      />,
    );
    expect(screen.getByTestId("live-waiting-view")).toBeInTheDocument();
  });

  it("8.2 lets the player select an option without submitting, then confirm sends answer:submit", () => {
    const sendCommand = vi.fn();
    render(
      <LiveGameView
        copy={copy}
        step={activeStep}
        question={question}
        answerAck={null}
        ownResult={null}
        isExpired={() => false}
        sendCommand={sendCommand}
      />,
    );

    expect(screen.getByTestId("live-question-view")).toBeInTheDocument();
    const confirmButton = screen.getByTestId("confirm-answer-button");
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("question-option-b"));
    expect(sendCommand).not.toHaveBeenCalled();
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    expect(sendCommand).toHaveBeenCalledWith("answer:submit", { stepId: "step-1", optionId: "b" });
  });

  it("8.3 shows the answered holding view once answer_ack is received, disabling further selection", () => {
    render(
      <LiveGameView
        copy={copy}
        step={activeStep}
        question={question}
        answerAck={{ stepId: "step-1", optionId: "b" }}
        ownResult={null}
        isExpired={() => false}
        sendCommand={vi.fn()}
      />,
    );

    expect(screen.getByTestId("live-locked-view")).toBeInTheDocument();
    expect(screen.getByText(copy.liveAnsweredTitle)).toBeInTheDocument();
    expect(screen.queryByTestId("live-question-view")).not.toBeInTheDocument();
  });

  it("8.3 shows the locked (no-answer) holding view once the step's server state is locked", () => {
    render(
      <LiveGameView
        copy={copy}
        step={{ ...activeStep, status: "locked" }}
        question={question}
        answerAck={null}
        ownResult={null}
        isExpired={() => false}
        sendCommand={vi.fn()}
      />,
    );

    expect(screen.getByTestId("live-locked-view")).toBeInTheDocument();
    expect(screen.getByText(copy.liveLockedTitle)).toBeInTheDocument();
  });

  it("8.4 disables selection at the client-computed expiry even before a locked broadcast arrives", () => {
    render(
      <LiveGameView
        copy={copy}
        step={activeStep}
        question={question}
        answerAck={null}
        ownResult={null}
        isExpired={() => true}
        sendCommand={vi.fn()}
      />,
    );

    // step.status is still "active" server-side, but isExpired says the
    // client's own deadline has passed — must not show the question view.
    expect(screen.queryByTestId("live-question-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-locked-view")).toBeInTheDocument();
    expect(screen.getByText(copy.liveLockedTitle)).toBeInTheDocument();
  });

  describe("result view (scoring capability, task 3.2)", () => {
    const lockedStep: RoomStep = { ...activeStep, status: "locked" };

    it("shows correct + points earned when own_result is correct with points", () => {
      const ownResult: OwnResultMessage = { type: "own_result", stepId: "step-1", isCorrect: true, points: 5 };
      render(
        <LiveGameView
          copy={copy}
          step={lockedStep}
          question={question}
          answerAck={{ stepId: "step-1", optionId: "a" }}
          ownResult={ownResult}
          isExpired={() => false}
          sendCommand={vi.fn()}
        />,
      );

      expect(screen.getByTestId("live-result-view")).toBeInTheDocument();
      expect(screen.getByText(copy.liveResultCorrectTitle)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(String(5)))).toBeInTheDocument();
      expect(screen.queryByTestId("live-locked-view")).not.toBeInTheDocument();
    });

    it("shows correct-but-no-points, distinct from an outright wrong answer, when own_result is correct with 0 points", () => {
      const ownResult: OwnResultMessage = { type: "own_result", stepId: "step-1", isCorrect: true, points: 0 };
      render(
        <LiveGameView
          copy={copy}
          step={lockedStep}
          question={question}
          answerAck={{ stepId: "step-1", optionId: "a" }}
          ownResult={ownResult}
          isExpired={() => false}
          sendCommand={vi.fn()}
        />,
      );

      expect(screen.getByText(copy.liveResultCorrectNoPointsTitle)).toBeInTheDocument();
      expect(screen.queryByText(copy.liveResultIncorrectTitle)).not.toBeInTheDocument();
    });

    it("shows incorrect when own_result is incorrect", () => {
      const ownResult: OwnResultMessage = { type: "own_result", stepId: "step-1", isCorrect: false, points: 0 };
      render(
        <LiveGameView
          copy={copy}
          step={lockedStep}
          question={question}
          answerAck={null}
          ownResult={ownResult}
          isExpired={() => false}
          sendCommand={vi.fn()}
        />,
      );

      expect(screen.getByText(copy.liveResultIncorrectTitle)).toBeInTheDocument();
    });

    it("does not show a result for a different step's own_result", () => {
      const ownResult: OwnResultMessage = { type: "own_result", stepId: "some-other-step", isCorrect: true, points: 5 };
      render(
        <LiveGameView
          copy={copy}
          step={lockedStep}
          question={question}
          answerAck={null}
          ownResult={ownResult}
          isExpired={() => false}
          sendCommand={vi.fn()}
        />,
      );

      expect(screen.queryByTestId("live-result-view")).not.toBeInTheDocument();
      expect(screen.getByTestId("live-locked-view")).toBeInTheDocument();
    });
  });
});
