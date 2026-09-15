import { useState } from "react";
import type { OwnResultMessage, RoomQuestion, RoomStep } from "@quiz/shared";

import { Button } from "@/components/ui/button";
import type { PlayerCopy } from "@/routes/player/copy";

interface Props {
  copy: PlayerCopy;
  step: RoomStep | null;
  question: RoomQuestion | null;
  answerAck: { stepId: string; optionId: string } | null;
  ownResult: OwnResultMessage | null;
  isExpired: (step: RoomStep | null) => boolean;
  sendCommand: (type: string, payload?: unknown) => void;
}

/**
 * The live-game surface shown once `state.eventStatus === "live"` (live-game
 * capability, FR-064's "waiting-state split" — player side only; no media,
 * that's the big screen's job per MILESTONE-09). Branches purely on the
 * current step/answer state — no internal connection concerns, those live in
 * `useEventRoom`.
 */
export function LiveGameView({ copy, step, question, answerAck, ownResult, isExpired, sendCommand }: Props) {
  if (!step || step.status === "pending") {
    return <WaitingView copy={copy} />;
  }

  // Once revealed, the player's own result supersedes every other view for
  // this step (scoring capability: "the player sees their own result").
  if (ownResult !== null && ownResult.stepId === step.id) {
    return <ResultView copy={copy} result={ownResult} />;
  }

  const answered = answerAck !== null && answerAck.stepId === step.id;
  // Client-side hard lock (design.md D8/FR-044): disable before the server's
  // own `locked` broadcast arrives, not only after `step.status` catches up.
  const locked = step.status !== "active" || isExpired(step);

  if (!answered && !locked && question) {
    return (
      <QuestionView
        copy={copy}
        step={step}
        question={question}
        onSubmit={(optionId) => sendCommand("answer:submit", { stepId: step.id, optionId })}
      />
    );
  }

  return <LockedView copy={copy} answered={answered} />;
}

function WaitingView({ copy }: { copy: PlayerCopy }) {
  return (
    <div data-testid="live-waiting-view" className="flex flex-col items-center gap-2 text-center">
      <h2 className="text-lg font-semibold">{copy.liveWaitingTitle}</h2>
      <p className="text-muted-foreground text-sm">{copy.liveWaitingBody}</p>
    </div>
  );
}

function QuestionView({
  copy,
  question,
  onSubmit,
}: {
  copy: PlayerCopy;
  step: RoomStep;
  question: RoomQuestion;
  onSubmit: (optionId: string) => void;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  return (
    <div data-testid="live-question-view" className="flex w-full flex-col gap-4 text-left">
      <p className="text-center text-lg font-semibold">{question.text}</p>
      <div role="radiogroup" className="flex flex-col gap-2">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selectedOptionId === option.id}
            data-testid={`question-option-${option.id}`}
            onClick={() => setSelectedOptionId(option.id)}
            className={`rounded-md border p-3 text-left ${
              selectedOptionId === option.id ? "border-primary bg-primary/10" : ""
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Button
        type="button"
        data-testid="confirm-answer-button"
        disabled={selectedOptionId === null}
        onClick={() => selectedOptionId && onSubmit(selectedOptionId)}
      >
        {copy.liveQuestionConfirmButton}
      </Button>
    </div>
  );
}

/**
 * The revealed result for the player's own step (scoring capability): never
 * the correct option, other players' answers, or rankings — only whether
 * *this* player was right and how many points they earned.
 */
function ResultView({ copy, result }: { copy: PlayerCopy; result: OwnResultMessage }) {
  if (result.isCorrect && result.points > 0) {
    return (
      <div data-testid="live-result-view" className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-lg font-semibold">{copy.liveResultCorrectTitle}</h2>
        <p className="text-muted-foreground text-sm">
          {result.points} {copy.liveResultPointsEarnedSuffix}
        </p>
      </div>
    );
  }

  if (result.isCorrect) {
    return (
      <div data-testid="live-result-view" className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-lg font-semibold">{copy.liveResultCorrectNoPointsTitle}</h2>
        <p className="text-muted-foreground text-sm">{copy.liveResultCorrectNoPointsBody}</p>
      </div>
    );
  }

  return (
    <div data-testid="live-result-view" className="flex flex-col items-center gap-2 text-center">
      <h2 className="text-lg font-semibold">{copy.liveResultIncorrectTitle}</h2>
      <p className="text-muted-foreground text-sm">{copy.liveResultIncorrectBody}</p>
    </div>
  );
}

function LockedView({ copy, answered }: { copy: PlayerCopy; answered: boolean }) {
  return (
    <div data-testid="live-locked-view" className="flex flex-col items-center gap-2 text-center">
      <h2 className="text-lg font-semibold">{answered ? copy.liveAnsweredTitle : copy.liveLockedTitle}</h2>
      <p className="text-muted-foreground text-sm">{answered ? copy.liveAnsweredBody : copy.liveLockedBody}</p>
    </div>
  );
}
