import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "@/routes/admin/useAdminAuth";
import { useAuth } from "@/hooks/useAuth";
import { getScreenCopy } from "@/routes/screenCopy";
import { BigScreenView } from "@/routes/ScreenViews";
import { useEventRoom } from "@/routes/player/useEventRoom";

interface ScreenEvent {
  language: "fr" | "en";
  waiting_media_path: string | null;
  waiting_countdown_target: string | null;
}

/**
 * Big-screen receiver (big-screen capability, FR-058). Connects as
 * `role = screen` reusing the operator's own admin session (design.md D1) —
 * the same browser opened this page, whether via a plain new window or the
 * Presentation API's built-in "cast to a secondary display" (MILESTONE-09).
 */
export function ScreenRoute() {
  const { eventId } = useParams<{ eventId: string }>();
  const adminAuth = useAdminAuth();
  const { session } = useAuth();
  const [event, setEvent] = useState<ScreenEvent | null>(null);

  useEffect(() => {
    if (!eventId || adminAuth.status !== "admin") return;
    let cancelled = false;
    supabase
      .from("event")
      .select("language, waiting_media_path, waiting_countdown_target")
      .eq("id", eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setEvent(data as ScreenEvent);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, adminAuth.status]);

  const { state, stepResults, rankings } = useEventRoom(
    eventId ?? "",
    adminAuth.status === "admin" ? session?.access_token : undefined,
    { screen: true },
  );

  const copy = getScreenCopy(event?.language);

  if (!eventId) return null;

  if (adminAuth.status === "loading") return null;

  if (adminAuth.status !== "admin") {
    // The screen reuses the operator's own admin session (design.md D1) —
    // there is no separate screen-only credential to sign in with here.
    // No event is resolved yet at this point, so copy defaults to French,
    // same convention as PlayerRoute's pre-resolution states.
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black p-10 text-center text-white">
        <p role="alert">{getScreenCopy(null).notAdminMessage}</p>
      </main>
    );
  }

  return (
    <main
      data-testid="screen-route"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-black p-10 text-center text-white"
    >
      <BigScreenView
        copy={copy}
        display={state?.display ?? "waiting"}
        question={state?.question ?? null}
        stepResults={stepResults}
        rankings={rankings}
        mediaUrl={event?.waiting_media_path ?? null}
        countdownTarget={event?.waiting_countdown_target ?? null}
        killSwitch={state?.killSwitch ?? false}
      />
    </main>
  );
}
