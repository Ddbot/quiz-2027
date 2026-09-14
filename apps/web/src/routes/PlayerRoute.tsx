import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { getPlayerCopy } from "@/routes/player/copy";
import { OnboardingFlow } from "@/routes/player/OnboardingFlow";
import type { EventSummary } from "@/routes/player/types";

type ResolveState =
  | { status: "resolving" }
  | { status: "invalid" }
  | { status: "resolved"; event: EventSummary };

/** Player entry surface: resolves the join code, then runs the onboarding flow. */
export function PlayerRoute() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const [resolve, setResolve] = useState<ResolveState>({ status: "resolving" });

  useEffect(() => {
    // No code to resolve at all — handled directly in the render below, so
    // there's nothing for this effect to do (no state changes needed here).
    if (!joinCode) return;

    let cancelled = false;

    supabase
      .from("event_public_summary")
      .select("*")
      .eq("join_code", joinCode)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setResolve(
          error || !data
            ? { status: "invalid" }
            : { status: "resolved", event: data as EventSummary },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  if (!joinCode) {
    const copy = getPlayerCopy(null);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">{copy.heading}</h1>
        <p role="alert">
          <strong>{copy.invalidCodeTitle}</strong>
          <br />
          {copy.invalidCodeBody}
        </p>
      </main>
    );
  }

  if (resolve.status === "resolving") {
    const copy = getPlayerCopy(null);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">{copy.heading}</h1>
        <p className="text-muted-foreground" data-testid="join-code">
          {joinCode}
        </p>
        <p aria-live="polite">{copy.resolving}</p>
      </main>
    );
  }

  if (resolve.status === "invalid") {
    const copy = getPlayerCopy(null);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">{copy.heading}</h1>
        <p className="text-muted-foreground" data-testid="join-code">
          {joinCode}
        </p>
        <p role="alert">
          <strong>{copy.invalidCodeTitle}</strong>
          <br />
          {copy.invalidCodeBody}
        </p>
      </main>
    );
  }

  const copy = getPlayerCopy(resolve.event.language);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{copy.heading}</h1>
      <p className="sr-only" data-testid="join-code">
        {joinCode}
      </p>
      <p className="text-muted-foreground" data-testid="event-title">
        {resolve.event.title}
      </p>
      <OnboardingFlow event={resolve.event} />
    </main>
  );
}
