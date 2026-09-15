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

    identityChooseMode: "Comment souhaitez-vous participer ?",
    modeAnonymous: "Invité (sans compte)",
    modeCreateAccount: "Créer un compte",
    modeSignIn: "Se connecter",

    displayNameLabel: "Nom affiché",
    emailLabel: "Adresse e-mail",
    passwordLabel: "Mot de passe",

    over16Label: "J'ai plus de 16 ans",
    tosLabel: "J'accepte les Conditions d'utilisation et la Politique de confidentialité",
    termsLinkText: "Conditions d'utilisation",
    privacyLinkText: "Politique de confidentialité",
    marketingLabel: "Je souhaite recevoir des actualités par e-mail (facultatif)",
    consentRequired: "Ces deux cases sont obligatoires pour continuer.",

    continueButton: "Continuer",
    signInButton: "Se connecter",

    checkEmailTitle: "Vérifiez votre e-mail",
    checkEmailBody: "Un lien de confirmation vient de vous être envoyé. Cliquez dessus pour continuer.",

    nameConfirmTitle: "Ce nom est permanent",
    nameConfirmBody:
      "Une fois confirmé, ce nom ne pourra plus être modifié pour cet événement. Vérifiez qu'il vous convient.",
    nameConfirmButton: "Confirmer et rejoindre",
    nameConfirmBack: "Retour",

    joining: "Connexion en cours…",
    joinedTitle: "Vous avez rejoint l'événement",

    errorProfanity: "Ce nom n'est pas autorisé. Merci d'en choisir un autre.",
    errorInvalidCode: "Ce code ne correspond à aucun événement disponible.",
    errorEventNotJoinable: "Cet événement est terminé et n'accepte plus de nouveaux joueurs.",
    errorGeneric: "Une erreur est survenue. Merci de réessayer.",
    retryButton: "Réessayer",

    teamLobbyTitle: "Équipe",
    teamLobbySoloIntro: "Vous jouez en solo pour l'instant. Créez une équipe ou rejoignez-en une.",
    teamNameLabel: "Nom de l'équipe",
    createTeamButton: "Créer une équipe",
    joinTeamButton: "Rejoindre",
    leaveTeamButton: "Quitter l'équipe",
    renameTeamButton: "Renommer",
    currentTeamLabel: "Votre équipe",
    noTeamsAvailable: "Aucune équipe pour le moment. Soyez la première à en créer une !",
    teamErrorNameTaken: "Ce nom d'équipe est déjà pris. Merci d'en choisir un autre.",
    teamErrorNotCaptain: "Seul le ou la capitaine peut renommer l'équipe.",

    liveWaitingTitle: "En attente du prochain round",
    liveWaitingBody: "Restez sur cette page, la partie va bientôt commencer.",
    liveQuestionConfirmButton: "Valider ma réponse",
    liveAnsweredTitle: "Réponse envoyée",
    liveAnsweredBody: "En attente du résultat…",
    liveLockedTitle: "Temps écoulé",
    liveLockedBody: "Vous n'avez pas répondu à temps. En attente du résultat…",
    liveResultCorrectTitle: "Bonne réponse !",
    liveResultPointsEarnedSuffix: "point(s) gagné(s)",
    liveResultCorrectNoPointsTitle: "Bonne réponse, mais pas assez rapide",
    liveResultCorrectNoPointsBody: "Un autre joueur a répondu plus vite. 0 point.",
    liveResultIncorrectTitle: "Mauvaise réponse",
    liveResultIncorrectBody: "0 point.",

    landingIntro: "Entrez le code de la soirée pour rejoindre.",
    joinCodeInputLabel: "Code de participation",
    landingJoinButton: "Rejoindre",
    landingAdminLink: "Vous êtes organisateur ou organisatrice ? Se connecter",
  },
  en: {
    heading: "Quiz 2027",
    resolving: "Looking up the event…",
    invalidCodeTitle: "Code not found",
    invalidCodeBody: "That code doesn't match any joinable event.",

    identityChooseMode: "How would you like to join?",
    modeAnonymous: "Guest (no account)",
    modeCreateAccount: "Create an account",
    modeSignIn: "Sign in",

    displayNameLabel: "Display name",
    emailLabel: "Email address",
    passwordLabel: "Password",

    over16Label: "I am over 16 years old",
    tosLabel: "I accept the Terms of Service and Privacy Policy",
    termsLinkText: "Terms of Service",
    privacyLinkText: "Privacy Policy",
    marketingLabel: "I'd like to receive news by email (optional)",
    consentRequired: "Both boxes are required to continue.",

    continueButton: "Continue",
    signInButton: "Sign in",

    checkEmailTitle: "Check your email",
    checkEmailBody: "We just sent you a confirmation link. Click it to continue.",

    nameConfirmTitle: "This name is permanent",
    nameConfirmBody:
      "Once confirmed, this name cannot be changed for this event. Make sure you're happy with it.",
    nameConfirmButton: "Confirm and join",
    nameConfirmBack: "Back",

    joining: "Joining…",
    joinedTitle: "You've joined the event",

    errorProfanity: "That name isn't allowed. Please choose another one.",
    errorInvalidCode: "That code doesn't match any joinable event.",
    errorEventNotJoinable: "This event has ended and is no longer accepting new players.",
    errorGeneric: "Something went wrong. Please try again.",
    retryButton: "Retry",

    teamLobbyTitle: "Team",
    teamLobbySoloIntro: "You're playing solo for now. Create a team or join one.",
    teamNameLabel: "Team name",
    createTeamButton: "Create a team",
    joinTeamButton: "Join",
    leaveTeamButton: "Leave team",
    renameTeamButton: "Rename",
    currentTeamLabel: "Your team",
    noTeamsAvailable: "No teams yet. Be the first to create one!",
    teamErrorNameTaken: "That team name is already taken. Please choose another one.",
    teamErrorNotCaptain: "Only the captain can rename the team.",

    liveWaitingTitle: "Waiting for the next round",
    liveWaitingBody: "Stay on this page — the round will start shortly.",
    liveQuestionConfirmButton: "Submit my answer",
    liveAnsweredTitle: "Answer submitted",
    liveAnsweredBody: "Waiting for the result…",
    liveLockedTitle: "Time's up",
    liveLockedBody: "You didn't answer in time. Waiting for the result…",
    liveResultCorrectTitle: "Correct!",
    liveResultPointsEarnedSuffix: "point(s) earned",
    liveResultCorrectNoPointsTitle: "Correct, but not fast enough",
    liveResultCorrectNoPointsBody: "Another player answered faster. 0 points.",
    liveResultIncorrectTitle: "Incorrect",
    liveResultIncorrectBody: "0 points.",

    landingIntro: "Enter tonight's code to join.",
    joinCodeInputLabel: "Join code",
    landingJoinButton: "Join",
    landingAdminLink: "Are you the organizer? Sign in",
  },
} as const;

export type PlayerLanguage = keyof typeof playerCopy;
export type PlayerCopy = (typeof playerCopy)[PlayerLanguage];

export function getPlayerCopy(language: PlayerLanguage | null | undefined): PlayerCopy {
  return playerCopy[language ?? "fr"];
}
