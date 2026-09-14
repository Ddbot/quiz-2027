// Onboarding flow copy, FR/EN, selected by the event's `language` column
// (design.md D5 — a small local dictionary rather than a full i18n framework;
// player + big-screen surfaces are FR/EN per event, per project convention).
// Before an event is resolved (or on an invalid code), there's no `language`
// to key off yet, so `getPlayerCopy` defaults to French.

export const playerCopy = {
  fr: {
    heading: "Quiz 2027",
    resolving: "Recherche de l'événement…",
    invalidCodeTitle: "Code introuvable",
    invalidCodeBody: "Ce code ne correspond à aucun événement disponible.",
  },
  en: {
    heading: "Quiz 2027",
    resolving: "Looking up the event…",
    invalidCodeTitle: "Code not found",
    invalidCodeBody: "That code doesn't match any joinable event.",
  },
} as const;

export type PlayerLanguage = keyof typeof playerCopy;
export type PlayerCopy = (typeof playerCopy)[PlayerLanguage];

export function getPlayerCopy(language: PlayerLanguage | null | undefined): PlayerCopy {
  return playerCopy[language ?? "fr"];
}
