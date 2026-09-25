import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { isProfane } from "@quiz/shared";

import { getPlayerCopy, type PlayerCopy } from "@/routes/player/copy";
import { IdentityStep, type PendingJoin } from "@/routes/player/IdentityStep";
import { LiveGameView } from "@/routes/player/LiveGameView";
import { NameConfirmStep } from "@/routes/player/NameConfirmStep";
import { TeamLobbyStep } from "@/routes/player/TeamLobbyStep";
import type { EventSummary } from "@/routes/player/types";
import { useEventRoom } from "@/routes/player/useEventRoom";
import { useExistingParticipant } from "@/routes/player/useExistingParticipant";
import { useJoinEvent, type JoinedParticipant } from "@/routes/player/useJoinEvent";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

type FlowStep =
  | { name: "identity" }
  | { name: "check-email" }
  | { name: "confirm-name"; pending: PendingJoin };

/** Everything after the event resolves: identity, consent, name, and the join itself. */
export function OnboardingFlow({ event }: { event: EventSummary }) {
  const copy = getPlayerCopy(event.language);
  const [step, setStep] = useState<FlowStep>({ name: "identity" });
  const [clientFlaggedProfanity, setClientFlaggedProfanity] = useState(false);
  const { status, errorKind, participant, join } = useJoinEvent(event.join_code);
  const { session } = useAuth();
  const existingParticipant = useExistingParticipant(event.id, session);

  // Reload-rejoin (resilience-recovery-hardening design.md D1): a session
  // that already has a participant for this event switches straight to
  // JoinedView once the check resolves, instead of leaving the
  // identity/consent form up. Deliberately does NOT gate the identity
  // form's own render on this check settling first — `existingParticipant`
  // starts "loading" on every mount, so blocking here would delay the
  // normal (non-reload) case's very first paint behind an extra async hop
  // for no benefit, since nothing renders differently until "found"
  // actually happens. The trade-off is a brief flash of the identity form
  // before switching, only for a genuine reload with an existing session —
  // accepted as strictly better than blocking every mount.
  if (existingParticipant.status === "found") {
    return <JoinedView copy={copy} event={event} participant={existingParticipant.participant} />;
  }

  // Instant client-side profanity check (moderation-kill-switch design.md
  // D1) — a UX improvement layered in front of the unchanged, authoritative
  // server check: a flagged name never reaches `join_event` at all, so a
  // name that bypasses this (or wasn't caught, e.g. an outdated bundle)
  // still hits the same server rejection `useJoinEvent` already handles.
  function attemptJoin(pending: PendingJoin) {
    if (isProfane(pending.displayName)) {
      setClientFlaggedProfanity(true);
      return;
    }
    setClientFlaggedProfanity(false);
    void join(pending);
  }

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
      return <JoinedView copy={copy} event={event} participant={participant} />;
    }

    // The client-side check flags a match before any round trip; a
    // server-side rejection (errorKind === "profanity" below) is the same
    // retry UI, reached only if a name got past this check.
    if (clientFlaggedProfanity) {
      return (
        <ProfanityRetry
          copy={copy}
          initialName={step.pending.displayName}
          submitting={false}
          onRetry={(displayName) => attemptJoin({ ...step.pending, displayName })}
        />
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
            onRetry={(displayName) => attemptJoin({ ...step.pending, displayName })}
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
        onConfirm={() => attemptJoin(step.pending)}
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

interface JoinedViewProps {
  copy: PlayerCopy;
  event: EventSummary;
  participant: JoinedParticipant;
}

/**
 * The "joined" terminal state's own container (live-game capability, task
 * 9.1): opens the EventRoom WebSocket connection once a player reaches this
 * point (design.md's "once a player reaches the team-lobby step"), then
 * shows team formation while the event is still a draft or the live-game
 * view once it goes live — driven by the room's own `eventStatus`, which
 * supersedes the event summary's snapshot `status` the moment a `state`
 * message arrives.
 */
function JoinedView({ copy, event, participant }: JoinedViewProps) {
  const { session } = useAuth();
  const { state, connectionStatus, answerAck, lastError, ownResult, sendCommand, isExpired } = useEventRoom(
    event.id,
    session?.access_token,
  );
  const effectiveStatus = state?.eventStatus ?? event.status;

  // Kill switch takes priority over every other view (moderation-kill-switch
  // design.md D3) — checked ahead of the draft/live/ended branching below,
  // mirroring the big screen's own early-return guard. `state.eventStatus`/
  // `step` are never touched by `mc:kill_switch`, so clearing it just
  // resumes this same branching, no separate "restore" logic needed.
  if (state?.killSwitch) return <KillSwitchOverlay />;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-lg font-semibold">{copy.joinedTitle}</h2>
        <p data-testid="joined-display-name">{participant.display_name}</p>
      </div>
      {/* `partysocket` already auto-reconnects with backoff (FR-086) — this
          is purely so the player sees *something* while that happens,
          instead of a screen indistinguishable from a healthy connection
          (resilience-recovery-hardening design.md D2). */}
      {connectionStatus !== "open" && (
        <p data-testid="connection-status-indicator" role="status" className="text-muted-foreground text-center text-sm">
          {copy.reconnectingNotice}
        </p>
      )}
      {effectiveStatus === "draft" && (
        <TeamLobbyStep copy={copy} eventId={event.id} participantId={participant.id} />
      )}
      {effectiveStatus === "live" && state && (
        <>
          {/* A player previously got no feedback at all when answer:submit
              was rejected (e.g. already answered, too late, kill switch) —
              the question view just sat there with nothing visibly
              happening. Surfacing the room's own last error here fixes that
              (production feedback). */}
          {lastError && (
            <p role="alert" className="text-sm text-destructive">
              {copy.errorGeneric}
            </p>
          )}
          <LiveGameView
            copy={copy}
            step={state.step}
            question={state.question}
            answerAck={answerAck}
            ownResult={ownResult}
            isExpired={isExpired}
            sendCommand={sendCommand}
          />
        </>
      )}
      {effectiveStatus === "ended" && <EventEndedView copy={copy} />}
    </div>
  );
}

/**
 * A still-connected player's terminal state once the event has ended
 * (live-game capability, reveal-leaderboard-end) — `eventStatus: "ended"`
 * only became reachable this milestone; without this, a connected player
 * saw a blank area below the joined header once it happened.
 */
function EventEndedView({ copy }: { copy: PlayerCopy }) {
  return (
    <div data-testid="event-ended-view" className="flex flex-col items-center gap-2 text-center">
      <h2 className="text-lg font-semibold">{copy.eventEndedTitle}</h2>
      <p className="text-muted-foreground text-sm">
        <Link to="/" className="underline">
          {copy.eventEndedBody}
        </Link>
      </p>
    </div>
  );
}

/**
 * The kill switch's blanking overlay (moderation-kill-switch) — visually
 * identical intent to the big screen's own overlay (`ScreenViews.tsx`'s
 * `KillSwitchOverlay`), a true blank, no copy needed.
 */
function KillSwitchOverlay() {
  return <div data-testid="killswitch-overlay" className="h-full w-full" />;
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
