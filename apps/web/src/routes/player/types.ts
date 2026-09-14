/** Shape of `event_public_summary` (data-model, auth-onboarding). */
export interface EventSummary {
  id: string;
  join_code: string;
  title: string;
  language: "fr" | "en";
  status: "draft" | "live" | "ended";
  venue_label: string | null;
}
