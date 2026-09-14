// EventRoom authoritative state — portable per NFR-017 (no Cloudflare/DO
// import). Used by apps/party's EventRoom and, later, the real game-flow
// command handlers (scoring, timer, MCQ) built on the same primitives.

/** A connection's role, resolved server-side at connect time (event-room capability). */
export type RoomRole = "player" | "admin";

/** Summary of the event's current step, as held by the EventRoom (SPEC.md §7.4.2 `state`). */
export interface RoomStep {
  id: string;
  position: number;
  timed: boolean;
  countdownSeconds: number;
  status: "pending" | "active" | "locked" | "revealed" | "done";
  timerStartedAt: string | null;
}

/** What the big screen (and, later, players) should currently render. */
export type RoomDisplay =
  | "waiting"
  | "question"
  | "collecting"
  | "results"
  | "leaderboard"
  | "podium"
  | "blank";

/**
 * The EventRoom's authoritative state (FR-030). Matches the `state` message
 * shape in SPEC.md §7.4.2's Server→Client table, minus `serverNow` (computed
 * fresh per send, not stored — see design.md D3/context).
 */
export interface RoomState {
  eventStatus: "draft" | "live" | "ended";
  step: RoomStep | null;
  display: RoomDisplay;
  /** `profile_id` of the identity currently holding the flow-control lock, or none yet. */
  controllerId: string | null;
}

/** The state a freshly constructed EventRoom starts with (no prior persisted state). */
export function defaultRoomState(): RoomState {
  return { eventStatus: "draft", step: null, display: "waiting", controllerId: null };
}

/**
 * Applies a pure mutation to `state`, returning the resulting state and
 * whether it actually changed. `mutate` MUST return the same object
 * reference when it makes no change — this reference-equality check is the
 * idempotency primitive (FR-035, design.md D5): callers only persist and
 * broadcast when `changed` is true.
 */
export function applyMutation(
  state: RoomState,
  mutate: (state: RoomState) => RoomState,
): { state: RoomState; changed: boolean } {
  const next = mutate(state);
  return { state: next, changed: next !== state };
}

/**
 * Whether `callerProfileId` currently holds the flow-control lock (FR-034).
 * Pure and portable so every future flow-control command handler can reuse
 * it without depending on the Durable Object runtime.
 */
export function requireFlowController(state: RoomState, callerProfileId: string): boolean {
  return state.controllerId !== null && state.controllerId === callerProfileId;
}
