// Client-side companion to Postgres's `is_profane()` (moderation-kill-switch
// design.md D1) — a UX improvement layered in front of the server check,
// which stays authoritative. This literal list is the single source of
// truth: the `moderate_participant`/`moderate_team` migration's
// `profanity_word` seed is generated from these same words at authoring
// time (see that migration's own comment) rather than kept independently,
// so the two can't silently drift apart. Starter FR+EN list, same trade-off
// already accepted in MILESTONE-03 (short substrings can false-positive
// inside an unrelated word; not an exhaustive classifier).
export const PROFANITY_WORDLIST: readonly string[] = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "merde",
  "putain",
  "connard",
  "salope",
  "encule",
];

/**
 * Case-insensitive substring match, mirroring Postgres `is_profane()`'s
 * `candidate ilike ('%' || word || '%')` semantics exactly, so the client
 * and server never disagree on a given input.
 */
export function isProfane(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return PROFANITY_WORDLIST.some((word) => lower.includes(word));
}
