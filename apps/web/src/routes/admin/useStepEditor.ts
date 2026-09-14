import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { AdminEvent, AdminMcq, AdminStep } from "@/routes/admin/types";

type StepEditorState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "loaded"; event: AdminEvent; step: AdminStep; mcq: AdminMcq | null };

/** Loads the parent event, one step, and its MCQ content (if configured yet). */
export function useStepEditor(eventId: string | undefined, stepId: string | undefined) {
  const [state, setState] = useState<StepEditorState>({ status: "loading" });

  const reload = useCallback(() => {
    if (!eventId || !stepId) return;
    Promise.all([
      supabase.from("event").select("*").eq("id", eventId).maybeSingle(),
      supabase.from("step").select("*").eq("id", stepId).maybeSingle(),
      supabase.from("game_mcq").select("*").eq("step_id", stepId).maybeSingle(),
    ]).then(([eventResult, stepResult, mcqResult]) => {
      if (eventResult.error || !eventResult.data || stepResult.error || !stepResult.data) {
        setState({ status: "not-found" });
        return;
      }
      setState({
        status: "loaded",
        event: eventResult.data as AdminEvent,
        step: stepResult.data as AdminStep,
        mcq: (mcqResult.data as AdminMcq | null) ?? null,
      });
    });
  }, [eventId, stepId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
