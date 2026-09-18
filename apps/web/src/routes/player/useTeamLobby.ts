import { useCallback, useEffect, useState } from "react";

import { isProfane } from "@quiz/shared";

import { supabase } from "@/lib/supabase";
import { mapTeamLobbyError, type TeamLobbyErrorKind } from "@/routes/player/teamLobbyErrors";
import type { Team } from "@/routes/player/types";

type TeamLobbyState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; teams: Team[]; myTeamId: string | null };

/**
 * Team-lobby data + actions for one participant in one event
 * (team-lobby capability). Refetch-based, not real-time — see design.md D6.
 */
export function useTeamLobby(eventId: string, participantId: string) {
  const [state, setState] = useState<TeamLobbyState>({ status: "loading" });
  const [actionError, setActionError] = useState<TeamLobbyErrorKind | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      supabase.from("team").select("*").eq("event_id", eventId).eq("dissolved", false),
      supabase.from("participant").select("team_id").eq("id", participantId).single(),
    ]).then(([teamsResult, participantResult]) => {
      if (teamsResult.error || participantResult.error) {
        setState({ status: "error" });
        return;
      }
      setState({
        status: "loaded",
        teams: (teamsResult.data ?? []) as Team[],
        myTeamId: (participantResult.data?.team_id as string | null) ?? null,
      });
    });
  }, [eventId, participantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createTeam(name: string): Promise<boolean> {
    setActionError(null);
    // Instant client-side check (moderation-kill-switch design.md D1) — a
    // UX improvement in front of the unchanged, authoritative server check;
    // a name that bypasses this still hits `create_team`'s own rejection.
    if (isProfane(name)) {
      setActionError("profanity");
      return false;
    }
    const { error } = await supabase.rpc("create_team", { p_event_id: eventId, p_name: name });
    if (error) {
      setActionError(mapTeamLobbyError(error.message));
      return false;
    }
    reload();
    return true;
  }

  async function joinTeam(teamId: string): Promise<boolean> {
    setActionError(null);
    const { error } = await supabase.rpc("join_team", { p_team_id: teamId });
    if (error) {
      setActionError(mapTeamLobbyError(error.message));
      return false;
    }
    reload();
    return true;
  }

  async function leaveTeam(): Promise<boolean> {
    setActionError(null);
    const { error } = await supabase.rpc("leave_team", { p_event_id: eventId });
    if (error) {
      setActionError(mapTeamLobbyError(error.message));
      return false;
    }
    reload();
    return true;
  }

  async function renameTeam(teamId: string, name: string): Promise<boolean> {
    setActionError(null);
    if (isProfane(name)) {
      setActionError("profanity");
      return false;
    }
    const { error } = await supabase.rpc("rename_team", { p_team_id: teamId, p_name: name });
    if (error) {
      setActionError(mapTeamLobbyError(error.message));
      return false;
    }
    reload();
    return true;
  }

  return { ...state, actionError, createTeam, joinTeam, leaveTeam, renameTeam };
}
