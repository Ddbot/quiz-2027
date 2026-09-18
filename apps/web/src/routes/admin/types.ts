/** Shape of `public.event` rows the admin console reads/writes (MILESTONE-02 schema). */
export interface AdminEvent {
  id: string;
  join_code: string;
  title: string;
  language: "fr" | "en";
  status: "draft" | "live" | "ended";
  venue_label: string | null;
  waiting_media_path: string | null;
  waiting_countdown_target: string | null;
  created_at: string;
}

/** Shape of `public.step` rows. */
export interface AdminStep {
  id: string;
  event_id: string;
  position: number;
  timed: boolean;
  countdown_seconds: number;
  points_correct: number;
  team_award_points: number;
  status: "pending" | "active" | "locked" | "revealed" | "done";
}

export interface McqOption {
  id: string;
  label: string;
}

/** Shape of `public.game_mcq` rows (one per step, primary key `step_id`). */
export interface AdminMcq {
  step_id: string;
  question_text: string;
  options: McqOption[];
  correct_option_id: string;
}

/** Shape of `public.participant` rows, as the moderation roster needs them (moderation-kill-switch). */
export interface AdminParticipant {
  id: string;
  display_name: string;
  hidden: boolean;
}

/** Shape of `public.team` rows, as the moderation roster needs them. */
export interface AdminTeam {
  id: string;
  name: string;
  hidden: boolean;
}
