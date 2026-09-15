/** Shape of `event_public_summary` (data-model, auth-onboarding). */
export interface EventSummary {
  id: string;
  join_code: string;
  title: string;
  language: "fr" | "en";
  status: "draft" | "live" | "ended";
  venue_label: string | null;
}

/** A `team` row as read by the team-lobby step (data-model, team-lobby). */
export interface Team {
  id: string;
  event_id: string;
  name: string;
  captain_participant_id: string | null;
}
