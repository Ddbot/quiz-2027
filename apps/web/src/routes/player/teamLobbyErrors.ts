/** Error keywords the team RPCs raise (team-lobby/data-model spec), mapped to a UI-renderable kind. */
export type TeamLobbyErrorKind =
  | "name_taken"
  | "profanity"
  | "not_a_participant"
  | "not_captain"
  | "event_not_joinable"
  | "generic";

const KNOWN_KEYWORDS: readonly TeamLobbyErrorKind[] = [
  "name_taken",
  "profanity",
  "not_a_participant",
  "not_captain",
  "event_not_joinable",
];

export function mapTeamLobbyError(message: string | undefined): TeamLobbyErrorKind {
  const kind = KNOWN_KEYWORDS.find((k) => k === message);
  return kind ?? "generic";
}
