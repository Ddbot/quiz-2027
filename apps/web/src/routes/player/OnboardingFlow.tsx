import { useState, type FormEvent } from "react";

import { getPlayerCopy } from "@/routes/player/copy";
import { IdentityStep, type PendingJoin } from "@/routes/player/IdentityStep";
import { NameConfirmStep } from "@/routes/player/NameConfirmStep";
import { TeamLobbyStep } from "@/routes/player/TeamLobbyStep";
import type { EventSummary } from "@/routes/player/types";
import { useJoinEvent } from "@/routes/player/useJoinEvent";
import { Button } from "@/components/ui/button";

type FlowStep =
  | { name: "identity" }
  | { name: "check-email" }
  | { name: "confirm-name"; pending: PendingJoin };

/** Everything after the event resolves: identity, consent, name, and the join itself. */
export function OnboardingFlow({ event }: { event: EventSummary }) {
  const copy = getPlayerCopy(event.language);
  const [step, setStep] = useState<FlowStep>({ name: "identity" });
  const { status, errorKind, participant, join } = useJoinEvent(event.join_code);

  if (step.name === "check-email") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-lg font-semibold">{copy.checkEmailTitle}</h2>
        <p className="text-muted-foreground text-sm">{copy.checkEmailBody}</p>
      </div>
    );
  }

  if (step.name === "confirm-name") {
    if (status === "joined" && participant) {
      return (
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-2 text-center">
            <h2 className="text-lg font-semibold">{copy.joinedTitle}</h2>
            <p data-testid="joined-display-name">{participant.display_name}</p>
          </div>
          {event.status === "draft" && (
            <TeamLobbyStep copy={copy} eventId={event.id} participantId={participant.id} />
          )}
        </div>
      );
    }

    if (status === "error") {
      // Profanity is the one error the player can fix without redoing
      // identity/consent (already-established) — just let them retype the
      // name. Every other error means something about the event itself is
      // wrong, so send them back to the start.
      if (errorKind === "profanity") {
        return (
          <ProfanityRetry
            copy={copy}
            initialName={step.pending.displayName}
            submitting={false}
            onRetry={(displayName) => void join({ ...step.pending, displayName })}
          />
        );
      }

      const message =
        errorKind === "invalid_code"
          ? copy.errorInvalidCode
          : errorKind === "event_not_joinable"
            ? copy.errorEventNotJoinable
            : copy.errorGeneric;
      return (
        <div className="flex flex-col gap-3 text-center">
          <p role="alert">{message}</p>
          <Button type="button" onClick={() => setStep({ name: "identity" })}>
            {copy.retryButton}
          </Button>
        </div>
      );
    }

    return (
      <NameConfirmStep
        copy={copy}
        displayName={step.pending.displayName}
        submitting={status === "joining"}
        onConfirm={() => void join(step.pending)}
        onBack={() => setStep({ name: "identity" })}
      />
    );
  }

  return (
    <IdentityStep
      copy={copy}
      onIdentityReady={(pending) => setStep({ name: "confirm-name", pending })}
      onNeedsEmailConfirmation={() => setStep({ name: "check-email" })}
    />
  );
}

interface ProfanityRetryProps {
  copy: ReturnType<typeof getPlayerCopy>;
  initialName: string;
  submitting: boolean;
  onRetry: (displayName: string) => void;
}

/** FR-069 — a profane name is rejected with a retry prompt, not a full restart. */
function ProfanityRetry({ copy, initialName, submitting, onRetry }: ProfanityRetryProps) {
  const [displayName, setDisplayName] = useState(initialName);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onRetry(displayName);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-center">
      <p role="alert">{copy.errorProfanity}</p>
      <label className="flex flex-col gap-1 text-left text-sm">
        {copy.displayNameLabel}
        <input
          className="rounded-md border px-3 py-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={40}
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {copy.retryButton}
      </Button>
    </form>
  );
}
