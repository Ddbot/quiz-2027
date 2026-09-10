// Cross-cutting domain types shared by the web app and the real-time worker.
// Kept deliberately minimal for MILESTONE-01; the event/step/scoring model
// (SPEC.md §7.3) lands with later milestones.

/** Opaque identifier for a live event. */
export type EventId = string;

/** Short, human-enterable code that resolves to an EventId. */
export type JoinCode = string;

/** UI/broadcast language for an event's player-facing surfaces. */
export type EventLanguage = "fr" | "en";
