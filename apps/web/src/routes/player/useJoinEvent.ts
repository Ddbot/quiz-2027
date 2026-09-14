import { useState } from "react";

import { supabase } from "@/lib/supabase";
import type { PendingJoin } from "@/routes/player/IdentityStep";

export interface JoinedParticipant {
  id: string;
  display_name: string;
}

export type JoinErrorKind = "profanity" | "invalid_code" | "event_not_joinable" | "generic";

interface JoinEventState {
  status: "idle" | "joining" | "joined" | "error";
  participant?: JoinedParticipant;
  errorKind?: JoinErrorKind;
}

/** Calls the `join_event` RPC (SPEC.md §7.4.1) and maps its error shape for the UI. */
export function useJoinEvent(joinCode: string) {
  const [state, setState] = useState<JoinEventState>({ status: "idle" });

  async function join(pending: PendingJoin) {
    setState({ status: "joining" });
    const { data, error } = await supabase.rpc("join_event", {
      p_join_code: joinCode,
      p_display_name: pending.displayName,
      p_over16_ack: pending.over16Ack ?? null,
      p_marketing_consent: pending.marketingConsent ?? null,
    });

    if (error) {
      const kind: JoinErrorKind =
        error.message === "profanity" ||
        error.message === "invalid_code" ||
        error.message === "event_not_joinable"
          ? error.message
          : "generic";
      setState({ status: "error", errorKind: kind });
      return;
    }

    setState({ status: "joined", participant: data.participant as JoinedParticipant });
  }

  return { ...state, join };
}
