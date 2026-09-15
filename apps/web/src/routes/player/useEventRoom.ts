import { PartySocket } from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  GRACE_MS,
  type AnswerAckMessage,
  type ErrorMessage,
  type RoomStep,
  type StateMessage,
} from "@quiz/shared";

export type RoomConnectionStatus = "connecting" | "open" | "closed";

/**
 * The EventRoom WebSocket connection (live-game capability). Connects once
 * `eventId`/`accessToken` are available (design.md: "once a player reaches
 * the team-lobby step"), reconciles to every `state` snapshot (FR-032), and
 * exposes a live, ticking `isExpired` check so the client enforces the
 * answer deadline on its own clock, not only on the server's `locked`
 * broadcast (design.md D8).
 */
export function useEventRoom(eventId: string, accessToken: string | undefined) {
  const [connectionStatus, setConnectionStatus] = useState<RoomConnectionStatus>("connecting");
  const [state, setState] = useState<StateMessage | null>(null);
  const [answerAck, setAnswerAck] = useState<{ stepId: string; optionId: string } | null>(null);
  const [lastError, setLastError] = useState<ErrorMessage | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const host = import.meta.env.VITE_PARTY_HOST;
    if (!accessToken || !host) return;

    const socket = new PartySocket({
      host,
      party: "event-room",
      room: eventId,
      query: { token: accessToken },
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnectionStatus("open"));
    socket.addEventListener("close", () => setConnectionStatus("closed"));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type: string };
      if (message.type === "state") {
        const stateMessage = message as StateMessage;
        setState(stateMessage);
        setClockOffsetMs(Date.parse(stateMessage.serverNow) - Date.now());
      } else if (message.type === "answer_ack") {
        const ack = message as AnswerAckMessage;
        setAnswerAck({ stepId: ack.stepId, optionId: ack.optionId });
      } else if (message.type === "error") {
        setLastError(message as ErrorMessage);
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [eventId, accessToken]);

  // Ticks the clock so `isExpired` stays live even with no new server
  // message — the client must not wait for a `locked` broadcast to disable
  // input once its own computed deadline passes (design.md D8).
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const sendCommand = useCallback((type: string, payload?: unknown) => {
    socketRef.current?.send(JSON.stringify({ type, payload }));
  }, []);

  function isExpired(step: RoomStep | null): boolean {
    if (!step || !step.timed || !step.timerStartedAt) return false;
    const expiryMs = Date.parse(step.timerStartedAt) + step.countdownSeconds * 1000 + GRACE_MS;
    return now + clockOffsetMs > expiryMs;
  }

  return { connectionStatus, state, answerAck, lastError, sendCommand, isExpired };
}
