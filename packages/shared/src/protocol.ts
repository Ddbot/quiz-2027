// EventRoom WebSocket message envelope (SPEC.md §7.4.2). Portable per
// NFR-017 — grows as later milestones add real commands to the same shapes.
import type { RoomDisplay, RoomRankings, RoomState, RoomStepResults } from "./room.js";

/** Client → Server command envelope. */
export interface ClientCommand {
  type: string;
  payload?: unknown;
}

/** `mc:claim_control` (event-room capability) — MILESTONE-05's one command. */
export interface ClaimControlCommand extends ClientCommand {
  type: "mc:claim_control";
}

/** `mc:start` (event-room capability) — flow-controller only. */
export interface McStartCommand extends ClientCommand {
  type: "mc:start";
}

/** `mc:advance` (event-room capability) — flow-controller only. */
export interface McAdvanceCommand extends ClientCommand {
  type: "mc:advance";
}

/** `mc:lock` (event-room capability) — flow-controller only. */
export interface McLockCommand extends ClientCommand {
  type: "mc:lock";
}

/** `answer:submit` (event-room capability) — player only. */
export interface AnswerSubmitCommand extends ClientCommand {
  type: "answer:submit";
  payload: { stepId: string; optionId: string };
}

/** `mc:reveal` (event-room capability) — flow-controller only; requires the step already `locked`. */
export interface McRevealCommand extends ClientCommand {
  type: "mc:reveal";
}

/** `operator:display` (event-room capability) — any admin, not flow-controller-gated (design.md D3). */
export interface OperatorDisplayCommand extends ClientCommand {
  type: "operator:display";
  payload: { view: RoomDisplay };
}

/** `mc:show_leaderboard` (event-room capability) — flow-controller only; always recomputes/rebroadcasts (design.md D5). */
export interface McShowLeaderboardCommand extends ClientCommand {
  type: "mc:show_leaderboard";
}

/** `mc:end` (event-room capability) — flow-controller only; finalises the event (design.md D2). */
export interface McEndCommand extends ClientCommand {
  type: "mc:end";
}

/**
 * `mc:kill_switch` (event-room capability) — any admin, not flow-controller-gated
 * (moderation-kill-switch design.md D3, same shape as `mc:claim_control`/
 * `operator:display`). Blanks/freezes every connection when `on: true`, clears
 * it when `on: false`.
 */
export interface McKillSwitchCommand extends ClientCommand {
  type: "mc:kill_switch";
  payload: { on: boolean };
}

/** Server → Client `state` message (SPEC.md §7.4.2), sent on connect/reconnect and every change. */
export interface StateMessage {
  type: "state";
  eventStatus: RoomState["eventStatus"];
  step: RoomState["step"];
  question: RoomState["question"];
  display: RoomState["display"];
  controllerId: RoomState["controllerId"];
  /** Whether the admin kill switch is currently active (moderation-kill-switch design.md D3). */
  killSwitch: RoomState["killSwitch"];
  /** Server clock reference (FR-032) — computed fresh per send, never persisted. */
  serverNow: string;
}

/** Server → Client `error` message. */
export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

/**
 * Server → Client acknowledgment for `answer:submit`, sent only to the
 * submitter (event-room capability, design.md D7) — a protocol addition
 * beyond SPEC.md's literal table, since the client otherwise has no way to
 * distinguish "accepted" from "not processed yet" besides silence.
 */
export interface AnswerAckMessage {
  type: "answer_ack";
  stepId: string;
  optionId: string;
}

/**
 * Server → Client `step_results` (SPEC.md §7.4.2), broadcast to every
 * connection on `mc:reveal` — per-participant/per-team outcome, never which
 * option was correct (scoring capability, event-room capability). Shares its
 * data shape with `RoomState.lastStepResults` (design.md D2) so the cached
 * value can be resent verbatim on reconnect.
 */
export interface StepResultsMessage extends RoomStepResults {
  type: "step_results";
}

/**
 * Server → Client `rankings` (SPEC.md §7.4.2), broadcast alongside
 * `step_results` — the event's cumulative individual/team standings,
 * recomputed fresh from Postgres on every reveal (design.md D5). Shares its
 * data shape with `RoomState.lastRankings`.
 */
export interface RankingsMessage extends RoomRankings {
  type: "rankings";
}

/**
 * Server → Client `own_result` (SPEC.md §7.4.2), sent only to the player it
 * describes — their own outcome for the just-revealed step, nothing else.
 */
export interface OwnResultMessage {
  type: "own_result";
  stepId: string;
  isCorrect: boolean;
  points: number;
}

export function toStateMessage(state: RoomState, serverNow: string): StateMessage {
  return {
    type: "state",
    eventStatus: state.eventStatus,
    step: state.step,
    question: state.question,
    display: state.display,
    controllerId: state.controllerId,
    killSwitch: state.killSwitch,
    serverNow,
  };
}
