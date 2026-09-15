// EventRoom WebSocket message envelope (SPEC.md §7.4.2). Portable per
// NFR-017 — grows as later milestones add real commands to the same shapes.
import type { RoomState } from "./room.js";
import type { ParticipantStepResult, TeamStepResult } from "./scoring.js";

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

/** Server → Client `state` message (SPEC.md §7.4.2), sent on connect/reconnect and every change. */
export interface StateMessage {
  type: "state";
  eventStatus: RoomState["eventStatus"];
  step: RoomState["step"];
  question: RoomState["question"];
  display: RoomState["display"];
  controllerId: RoomState["controllerId"];
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
 * option was correct (scoring capability, event-room capability).
 */
export interface StepResultsMessage {
  type: "step_results";
  stepId: string;
  participants: ParticipantStepResult[];
  teams: TeamStepResult[];
}

/**
 * Server → Client `rankings` (SPEC.md §7.4.2), broadcast alongside
 * `step_results` — the event's cumulative individual/team standings,
 * recomputed fresh from Postgres on every reveal (design.md D5).
 */
export interface RankingsMessage {
  type: "rankings";
  individuals: { participantId: string; displayName: string; total: number; rank: number }[];
  teams: { teamId: string; name: string; total: number; rank: number }[];
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
    serverNow,
  };
}
