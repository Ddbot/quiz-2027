import { Link, useParams } from "react-router-dom";
import type { RoomDisplay } from "@quiz/shared";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { adminCopy, type AdminCopy } from "@/routes/admin/copy";
import { useEventRoom } from "@/routes/player/useEventRoom";

const DISPLAY_VIEWS: { view: RoomDisplay; label: keyof AdminCopy }[] = [
  { view: "waiting", label: "displayWaiting" },
  { view: "question", label: "displayQuestion" },
  { view: "collecting", label: "displayCollecting" },
  { view: "results", label: "displayResults" },
  { view: "leaderboard", label: "displayLeaderboard" },
  { view: "podium", label: "displayPodium" },
  { view: "blank", label: "displayBlank" },
];

/** A minimal ambient type for the Presentation API (design.md D5) — not in this project's lib.dom yet. */
interface PresentationRequestLike {
  start(): Promise<unknown>;
}
interface PresentationRequestConstructor {
  new (urls: string[]): PresentationRequestLike;
}

function castToScreen(url: string): void {
  const ctor = (window as unknown as { PresentationRequest?: PresentationRequestConstructor }).PresentationRequest;
  if (ctor) {
    new ctor([url]).start().catch(() => window.open(url, "_blank"));
    return;
  }
  window.open(url, "_blank");
}

/**
 * The admin's flow-control UI (mc-console capability) and the Operator's
 * view-switching + casting control (big-screen capability) — bundled onto
 * one page (design.md D6): both are "run the live event" admin surfaces.
 */
export function LiveControlPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { session } = useAuth();
  const { state, lastError, sendCommand } = useEventRoom(eventId ?? "", session?.access_token);

  if (!eventId) return null;

  const isController = state?.controllerId != null && state.controllerId === session?.user.id;

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/admin/events/${eventId}`} className="text-sm underline">
        {adminCopy.liveControlBack}
      </Link>
      <h2 className="text-lg font-semibold">{adminCopy.liveControlTitle}</h2>

      {lastError && (
        <p role="alert" className="text-sm text-destructive">
          {lastError.message}
        </p>
      )}

      <section className="flex flex-col gap-1 text-sm">
        <p>
          {adminCopy.statusLabel} : {state?.eventStatus ?? "…"}
        </p>
        <p>
          {state?.step
            ? `${adminCopy.currentStepLabel} : #${state.step.position} (${state.step.status})`
            : adminCopy.noCurrentStep}
        </p>
        <p data-testid="control-status">
          {!state?.controllerId
            ? adminCopy.controlHeldByNone
            : isController
              ? adminCopy.controlHeldByYou
              : adminCopy.controlHeldByOther}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => sendCommand("mc:claim_control")}>
          {adminCopy.claimControlButton}
        </Button>
        <Button
          type="button"
          disabled={!isController || state?.eventStatus !== "draft"}
          onClick={() => sendCommand("mc:start")}
        >
          {adminCopy.startEventButton}
        </Button>
        <Button
          type="button"
          disabled={!isController || state?.eventStatus !== "live"}
          onClick={() => sendCommand("mc:advance")}
        >
          {adminCopy.advanceButton}
        </Button>
        <Button
          type="button"
          disabled={!isController || state?.step?.status !== "active"}
          onClick={() => sendCommand("mc:lock")}
        >
          {adminCopy.lockButton}
        </Button>
        <Button
          type="button"
          disabled={!isController || state?.step?.status !== "locked"}
          onClick={() => sendCommand("mc:reveal")}
        >
          {adminCopy.revealButton}
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{adminCopy.displaySectionTitle}</h3>
        <div className="flex flex-wrap gap-2">
          {DISPLAY_VIEWS.map(({ view, label }) => (
            <Button
              key={view}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => sendCommand("operator:display", { view })}
            >
              {adminCopy[label]}
            </Button>
          ))}
        </div>
      </section>

      <Button
        type="button"
        variant="outline"
        onClick={() => castToScreen(`${window.location.origin}/screen/${eventId}`)}
      >
        {adminCopy.castButton}
      </Button>
    </div>
  );
}
