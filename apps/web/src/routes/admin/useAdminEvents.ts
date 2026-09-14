import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { AdminEvent } from "@/routes/admin/types";

type EventsState =
  | { status: "loading" }
  | { status: "loaded"; events: AdminEvent[] }
  | { status: "error" };

/** Lists every event visible to the admin (RLS: `is_admin()` sees all rows). */
export function useAdminEvents() {
  const [state, setState] = useState<EventsState>({ status: "loading" });

  const reload = useCallback(() => {
    // No synchronous setState here — the initial state is already "loading",
    // and a manual reload (after a mutation) keeps showing the stale list
    // until the refetch below resolves, which is fine for this console.
    supabase
      .from("event")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        setState(error ? { status: "error" } : { status: "loaded", events: (data ?? []) as AdminEvent[] });
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
