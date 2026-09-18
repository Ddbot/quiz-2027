import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A minimal fake PartySocket: a real EventTarget so addEventListener/dispatchEvent
// behave like the browser WebSocket the hook actually talks to. The test drives
// it directly instead of a real network connection (same convention as
// useTeamLobby.test.ts mocking `@/lib/supabase`).
class FakePartySocket extends EventTarget {
  sent: string[] = [];
  closed = false;
  constructor(public opts: { host: string; party: string; room: string; query?: Record<string, string> }) {
    super();
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

const instances: FakePartySocket[] = [];

vi.mock("partysocket", () => ({
  PartySocket: vi.fn().mockImplementation(function (
    this: unknown,
    opts: { host: string; party: string; room: string; query?: Record<string, string> },
  ) {
    const socket = new FakePartySocket(opts);
    instances.push(socket);
    return socket;
  }),
}));

const { useEventRoom } = await import("@/routes/player/useEventRoom");

function dispatchMessage(socket: FakePartySocket, data: unknown) {
  socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
}

beforeEach(() => {
  instances.length = 0;
  vi.stubEnv("VITE_PARTY_HOST", "127.0.0.1:8787");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useEventRoom", () => {
  it("connects via PartySocket with the room/token, matching ScreenRoute's call shape", () => {
    renderHook(() => useEventRoom("evt-1", "token-abc"));

    expect(instances).toHaveLength(1);
    expect(instances[0]!.opts).toMatchObject({
      host: "127.0.0.1:8787",
      party: "event-room",
      room: "evt-1",
      query: { token: "token-abc" },
    });
    expect(instances[0]!.opts.query?.token).toBe("token-abc");
  });

  it("adds screen=1 to the query when connecting as a screen (big-screen capability)", () => {
    renderHook(() => useEventRoom("evt-1", "token-abc", { screen: true }));

    expect(instances).toHaveLength(1);
    expect(instances[0]!.opts.query).toEqual({ token: "token-abc", screen: "1" });
  });

  it("does not add screen to the query for a normal (player) connection", () => {
    renderHook(() => useEventRoom("evt-1", "token-abc"));

    expect(instances[0]!.opts.query).toEqual({ token: "token-abc" });
  });

  it("updates connection status on open and exposed state on a state message", async () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    expect(result.current.connectionStatus).toBe("connecting");
    socket.dispatchEvent(new Event("open"));
    await waitFor(() => expect(result.current.connectionStatus).toBe("open"));

    dispatchMessage(socket, {
      type: "state",
      eventStatus: "live",
      step: null,
      question: null,
      display: "waiting",
      controllerId: "admin-1",
      serverNow: "2026-09-15T00:00:00.000Z",
    });

    await waitFor(() => expect(result.current.state?.eventStatus).toBe("live"));
    expect(result.current.state?.controllerId).toBe("admin-1");
  });

  it("exposes answer_ack messages", async () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    dispatchMessage(socket, { type: "answer_ack", stepId: "step-1", optionId: "a" });

    await waitFor(() =>
      expect(result.current.answerAck).toEqual({ stepId: "step-1", optionId: "a" }),
    );
  });

  it("exposes error messages", async () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    dispatchMessage(socket, { type: "error", code: "forbidden", message: "Not the controller" });

    await waitFor(() =>
      expect(result.current.lastError).toEqual({
        type: "error",
        code: "forbidden",
        message: "Not the controller",
      }),
    );
  });

  it("exposes own_result messages", async () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    dispatchMessage(socket, { type: "own_result", stepId: "step-1", isCorrect: true, points: 5 });

    await waitFor(() =>
      expect(result.current.ownResult).toEqual({
        type: "own_result",
        stepId: "step-1",
        isCorrect: true,
        points: 5,
      }),
    );
  });

  it("exposes step_results messages", async () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    dispatchMessage(socket, {
      type: "step_results",
      stepId: "step-1",
      participants: [{ participantId: "p-1", isCorrect: true, points: 5 }],
      teams: [{ teamId: "t-1", avgScore: 5, isWinner: true, awardedPoints: 10 }],
    });

    await waitFor(() => expect(result.current.stepResults?.stepId).toBe("step-1"));
    expect(result.current.stepResults?.participants).toEqual([{ participantId: "p-1", isCorrect: true, points: 5 }]);
  });

  it("exposes rankings messages", async () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    dispatchMessage(socket, {
      type: "rankings",
      individuals: [{ participantId: "p-1", displayName: "Alice", total: 5, rank: 1 }],
      teams: [{ teamId: "t-1", name: "Team A", total: 10, rank: 1 }],
    });

    await waitFor(() => expect(result.current.rankings?.individuals).toHaveLength(1));
    expect(result.current.rankings?.individuals[0]).toEqual({
      participantId: "p-1",
      displayName: "Alice",
      total: 5,
      rank: 1,
    });
  });

  it("sendCommand sends a JSON-encoded {type, payload} message", () => {
    const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
    const socket = instances[0]!;

    result.current.sendCommand("answer:submit", { stepId: "step-1", optionId: "a" });

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: "answer:submit",
      payload: { stepId: "step-1", optionId: "a" },
    });
  });

  it("does not connect when accessToken is not yet available", () => {
    renderHook(() => useEventRoom("evt-1", undefined));
    expect(instances).toHaveLength(0);
  });

  describe("isExpired (design.md D8: client-computed deadline via clock offset)", () => {
    const T0 = new Date("2026-09-15T00:00:00.000Z").getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(T0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("computes the expiry instant from timerStartedAt + countdownSeconds + GRACE_MS, offset by the server clock skew", () => {
      const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));
      const socket = instances[0]!;

      // Server clock reads 3s ahead of the local (faked) clock at receipt time,
      // so clockOffsetMs = +3000 — every later `isExpired` check must fold this in.
      act(() => {
        dispatchMessage(socket, {
          type: "state",
          eventStatus: "live",
          step: null,
          question: null,
          display: "question",
          controllerId: "admin-1",
          serverNow: new Date(T0 + 3000).toISOString(),
        });
      });

      const step = {
        id: "step-1",
        position: 1,
        timed: true,
        countdownSeconds: 2,
        status: "active" as const,
        timerStartedAt: new Date(T0).toISOString(),
      };
      // expiryMs = T0 + 2000 (countdown) + 2000 (GRACE_MS) = T0 + 4000.

      // Local clock at T0, +3000 offset => apparent server time T0+3000: not yet expired.
      expect(result.current.isExpired(step)).toBe(false);

      // Advance the local clock by 1500ms (T0+1500); with the +3000 offset the
      // apparent server time is T0+4500, past the T0+4000 expiry instant. Without
      // folding in the offset this would still read as not-expired (T0+1500 < T0+4000).
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(result.current.isExpired(step)).toBe(true);
    });

    it("is false for an untimed step and for no active step", () => {
      const { result } = renderHook(() => useEventRoom("evt-1", "token-abc"));

      expect(result.current.isExpired(null)).toBe(false);
      expect(
        result.current.isExpired({
          id: "step-1",
          position: 1,
          timed: false,
          countdownSeconds: 0,
          status: "active",
          timerStartedAt: null,
        }),
      ).toBe(false);
    });
  });
});
