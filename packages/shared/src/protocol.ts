// EventRoom WebSocket message envelope (SPEC.md §7.4.2). Portable per
// NFR-017 — grows as later milestones add real commands to the same shapes.
import type { RoomState } from "./room.js";

/** Client → Server command envelope. */
export interface ClientCommand {
  type: string;
  payload?: unknown;
}

/** `mc:claim_control` (event-room capability) — the only command this milestone implements. */
export interface ClaimControlCommand extends ClientCommand {
  type: "mc:claim_control";
}

/** Server → Client `state` message (SPEC.md §7.4.2), sent on connect/reconnect and every change. */
export interface StateMessage {
  type: "state";
  eventStatus: RoomState["eventStatus"];
  step: RoomState["step"];
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

export function toStateMessage(state: RoomState, serverNow: string): StateMessage {
  return {
    type: "state",
    eventStatus: state.eventStatus,
    step: state.step,
    display: state.display,
    controllerId: state.controllerId,
    serverNow,
  };
}
