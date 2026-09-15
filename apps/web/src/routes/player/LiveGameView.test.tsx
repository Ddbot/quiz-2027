import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getPlayerCopy } from "@/routes/player/copy";
import { LiveGameView } from "@/routes/player/LiveGameView";
import type { RoomQuestion, RoomStep } from "@quiz/shared";

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
});
