import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { EventDashboard } from "@/routes/admin/types";

type DashboardState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; dashboard: EventDashboard };

/** Loads one event's analytics dashboard (analytics capability). Fetch-on-mount, no realtime — a one-shot read, not a live view. */
export function useEventDashboard(eventId: string | undefined) {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    if (!eventId) return;
    supabase
      .rpc("event_dashboard", { p_event_id: eventId })
      .then(({ data, error }) => {
        if (error || !data) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "loaded", dashboard: data as EventDashboard });
      });
  }, [eventId]);

  return state;
}
