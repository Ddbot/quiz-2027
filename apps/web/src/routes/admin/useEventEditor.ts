import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { AdminEvent, AdminStep } from "@/routes/admin/types";

type EditorState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "loaded"; event: AdminEvent; steps: AdminStep[] };

/** Loads one event plus its ordered steps, for the event editor + step editor pages. */
export function useEventEditor(eventId: string | undefined) {
  const [state, setState] = useState<EditorState>({ status: "loading" });

  const reload = useCallback(() => {
    if (!eventId) return;
    Promise.all([
      supabase.from("event").select("*").eq("id", eventId).maybeSingle(),
      supabase
        .from("step")
        .select("*, game_mcq(question_text)")
        .eq("event_id", eventId)
        .order("position", { ascending: true }),
    ]).then(([eventResult, stepsResult]) => {
      if (eventResult.error || !eventResult.data) {
        setState({ status: "not-found" });
        return;
      }
      setState({
        status: "loaded",
        event: eventResult.data as AdminEvent,
        steps: (stepsResult.data ?? []) as AdminStep[],
      });
    });
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
