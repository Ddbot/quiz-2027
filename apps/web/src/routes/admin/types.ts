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

/** Shape of `public.step` rows, with its `game_mcq` question text embedded (null until the step's content is authored). */
export interface AdminStep {
  id: string;
  event_id: string;
  position: number;
  timed: boolean;
  countdown_seconds: number;
  points_correct: number;
  team_award_points: number;
  status: "pending" | "active" | "locked" | "revealed" | "done";
  game_mcq: { question_text: string } | null;
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

/** Shape of the `event_dashboard` RPC's response (analytics capability). */
export interface EventDashboard {
  participant_count: number;
  /** A fraction (0..1), not a percentage — the console formats it for display. */
  completion_rate: number;
  per_question: { step_id: string; correct: number; incorrect: number }[];
  avg_response_ms: number;
  final_participants: { participant_id: string; display_name: string; total_points: number; rank: number }[];
  final_teams: { team_id: string; name: string; total_awarded: number; rank: number }[];
}
