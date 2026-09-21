import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { AdminParticipant, AdminTeam } from "@/routes/admin/types";

type ModerationState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; participants: AdminParticipant[]; teams: AdminTeam[] };

/**
 * The event's participant/team roster for the console's moderation section
 * (mc-console capability, moderation-kill-switch) — fetch-on-mount,
 * refetch-after-the-admin's-own-action, AND a Postgres realtime subscription
 * so the list also updates when someone joins/renames/etc. from elsewhere
 * (production feedback: the admin previously had to reload the page to see
 * a newly-joined participant). Works for any `eventStatus` (design.md D5)
 * since the underlying RPCs carry no status restriction.
 */
export function useModeration(eventId: string | undefined) {
  const [state, setState] = useState<ModerationState>({ status: "loading" });

  const reload = useCallback(() => {
    if (!eventId) return;
    Promise.all([
      supabase.from("participant").select("id, display_name, hidden").eq("event_id", eventId),
      supabase.from("team").select("id, name, hidden").eq("event_id", eventId).eq("dissolved", false),
    ]).then(([participantsResult, teamsResult]) => {
      if (participantsResult.error || teamsResult.error) {
        setState({ status: "error" });
        return;
      }
      setState({
        status: "loaded",
        participants: (participantsResult.data ?? []) as AdminParticipant[],
        teams: (teamsResult.data ?? []) as AdminTeam[],
      });
    });
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`moderation-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participant", filter: `event_id=eq.${eventId}` },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team", filter: `event_id=eq.${eventId}` },
        () => reload(),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [eventId, reload]);

  async function setParticipantHidden(participantId: string, hidden: boolean): Promise<boolean> {
    const { error } = await supabase.rpc("moderate_participant", {
      p_participant_id: participantId,
      p_hidden: hidden,
    });
    if (error) return false;
    reload();
    return true;
  }

  async function renameParticipant(participantId: string, displayName: string): Promise<boolean> {
    const { error } = await supabase.rpc("moderate_participant", {
      p_participant_id: participantId,
      p_display_name: displayName,
    });
    if (error) return false;
    reload();
    return true;
  }

  async function setTeamHidden(teamId: string, hidden: boolean): Promise<boolean> {
    const { error } = await supabase.rpc("moderate_team", { p_team_id: teamId, p_hidden: hidden });
    if (error) return false;
    reload();
    return true;
  }

  async function renameTeam(teamId: string, name: string): Promise<boolean> {
    const { error } = await supabase.rpc("moderate_team", { p_team_id: teamId, p_name: name });
    if (error) return false;
    reload();
    return true;
  }

  return { ...state, setParticipantHidden, renameParticipant, setTeamHidden, renameTeam };
}
