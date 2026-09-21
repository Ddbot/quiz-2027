import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import type { JoinedParticipant } from "@/routes/player/useJoinEvent";

type ExistingParticipantState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "found"; participant: JoinedParticipant };

/**
 * Checks, exactly once, whether the *first* session `useAuth()` ever
 * resolves to already has a `participant` row for this event — the
 * reload-rejoin check (resilience-recovery-hardening design.md D1): a
 * returning player's page reload should land back on their current step
 * directly, not re-show the identity/consent form they already got past.
 *
 * Deliberately runs only once, guarded by `checkedRef`: a genuine page
 * reload has its session already resolved from persisted storage the first
 * time `session` stops being `undefined`, so checking then is exactly the
 * "did I already join before this reload" question. A session that instead
 * appears *later* — e.g. `signInAnonymously()` succeeding mid-flow, during
 * an active (non-reload) join — must NOT re-trigger this check; that's a
 * brand-new identity that has (by construction) no existing participant
 * yet, and re-running here would otherwise blank the whole in-progress flow
 * behind this hook's own "loading" gate every time the caller's session
 * changes for any reason.
 */
export function useExistingParticipant(
  eventId: string,
  session: Session | null | undefined,
): ExistingParticipantState {
  const [state, setState] = useState<ExistingParticipantState>({ status: "loading" });
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    if (session === undefined) return; // auth itself still resolving
    checkedRef.current = true;

    if (!session) {
      // Deferred via a microtask (not a synchronous setState in the effect
      // body) — this is a settled result, not a value to compute during
      // render, so it still belongs in state; it just needs to land the
      // same way the async fetch's own result does, in a callback rather
      // than synchronously within the effect.
      void Promise.resolve().then(() => setState({ status: "not-found" }));
      return;
    }
    supabase
      .from("participant")
      .select("id, display_name")
      .eq("event_id", eventId)
      .eq("profile_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setState({ status: "not-found" });
          return;
        }
        setState({ status: "found", participant: data as JoinedParticipant });
      });
  }, [eventId, session]);

  return state;
}
