import { Server, type Connection, type WSMessage } from "partyserver";

/**
 * One Durable Object instance per event id.
 *
 * MILESTONE-01 baseline: accept a WebSocket connection and echo any text
 * message back to the sender. No authentication, no persisted state, no game
 * logic — those arrive with later milestones.
 */
export class EventRoom extends Server {
  override onMessage(connection: Connection, message: WSMessage): void {
    connection.send(message);
  }
}
