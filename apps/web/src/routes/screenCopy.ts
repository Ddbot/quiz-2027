// Big-screen copy, FR/EN per event's `language` (NFR-012 groups big-screen
// text with player-facing text — only the admin *console* is French-only).

export const screenCopy = {
  fr: {
    heading: "Quiz 2027",
    waitingTitle: "En attente du début",
    waitingBody: "L'événement va bientôt commencer.",
    collectingTitle: "Collecte des réponses…",
    resultsTitle: "Résultats",
    resultsNoData: "En attente des résultats…",
    resultsCorrect: "Bonne réponse",
    resultsIncorrect: "Mauvaise réponse",
    resultsPointsSuffix: "pt(s)",
    leaderboardTitle: "Classement",
    podiumTitle: "Podium",
    noRankingsYet: "Aucun classement pour le moment.",
    notAdminMessage: "Cette page nécessite une session administrateur (Operator mode).",
  },
  en: {
    heading: "Quiz 2027",
    waitingTitle: "Waiting to begin",
    waitingBody: "The event will start shortly.",
    collectingTitle: "Collecting answers…",
    resultsTitle: "Results",
    resultsNoData: "Waiting for results…",
    resultsCorrect: "Correct",
    resultsIncorrect: "Incorrect",
    resultsPointsSuffix: "pt(s)",
    leaderboardTitle: "Leaderboard",
    podiumTitle: "Podium",
    noRankingsYet: "No rankings yet.",
    notAdminMessage: "This page requires an admin session (Operator mode).",
  },
} as const;

export type ScreenLanguage = keyof typeof screenCopy;
export type ScreenCopy = (typeof screenCopy)[ScreenLanguage];

export function getScreenCopy(language: ScreenLanguage | null | undefined): ScreenCopy {
  return screenCopy[language ?? "fr"];
}
