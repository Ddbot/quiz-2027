import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type AdminAuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden" }
  | { status: "admin" };

interface Resolved {
  userId: string;
  isAdmin: boolean;
}

/**
 * Resolves whether the signed-in identity is an admin (`profile.is_admin`).
 * RLS is the real enforcement boundary (see data-model's "Admin status is
 * granted out-of-band" requirement) — this hook is a UX gate only.
 */
export function useAdminAuth(): AdminAuthState {
  const { session, loading } = useAuth();
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    supabase
      .from("profile")
      .select("is_admin")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        setResolved({ userId: session.user.id, isAdmin: !error && Boolean(data?.is_admin) });
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) return { status: "loading" };
  if (!session) return { status: "signed-out" };
  if (!resolved || resolved.userId !== session.user.id) return { status: "loading" };
  return resolved.isAdmin ? { status: "admin" } : { status: "forbidden" };
}
