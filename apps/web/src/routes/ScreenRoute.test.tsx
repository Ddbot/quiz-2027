import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal fake PartySocket (mirrors useEventRoom.test.ts's convention).
const { FakePartySocket, socketInstances } = vi.hoisted(() => {
  class FakePartySocket extends EventTarget {
    sent: string[] = [];
    constructor(public opts: { host: string; party: string; room: string; query?: Record<string, string> }) {
      super();
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {}
  }
  return { FakePartySocket, socketInstances: [] as InstanceType<typeof FakePartySocket>[] };
});

vi.mock("partysocket", () => ({
  PartySocket: vi.fn().mockImplementation(function (
    this: unknown,
    opts: { host: string; party: string; room: string; query?: Record<string, string> },
  ) {
    const socket = new FakePartySocket(opts);
    socketInstances.push(socket);
    return socket;
  }),
}));

const { getSession, onAuthStateChange, from } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, onAuthStateChange }, from },
}));

function mockAdminAndEvent(eventOverrides: Record<string, unknown> = {}) {
  from.mockImplementation((table: string) => {
    if (table === "profile") {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { is_admin: true }, error: null }) }) }) };
    }
    if (table === "event") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  language: "fr",
                  waiting_media_path: null,
                  waiting_countdown_target: null,
                  ...eventOverrides,
                },
                error: null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

const { AuthProvider } = await import("@/components/AuthProvider");
const { ScreenRoute } = await import("@/routes/ScreenRoute");

function renderScreen(eventId = "evt-1") {
  return render(
    <MemoryRouter initialEntries={[`/screen/${eventId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/screen/:eventId" element={<ScreenRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function dispatchMessage(socket: InstanceType<typeof FakePartySocket>, data: unknown) {
  socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  socketInstances.length = 0;
  getSession.mockResolvedValue({
    data: { session: { user: { id: "admin-1" }, access_token: "admin-token" } },
  });
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("ScreenRoute", () => {
  it("connects as screen (design.md D1) once the admin session resolves", async () => {
    mockAdminAndEvent();
    renderScreen("evt-1");

    await screen.findByTestId("screen-route");
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    expect(socketInstances[0]!.opts).toMatchObject({ room: "evt-1", query: { token: "admin-token", screen: "1" } });
  });

  it("fetches and renders the configured waiting-screen media", async () => {
    mockAdminAndEvent({ waiting_media_path: "https://example.com/waiting.png" });
    renderScreen();

    expect(await screen.findByTestId("screen-waiting-media")).toHaveAttribute(
      "src",
      "https://example.com/waiting.png",
    );
  });

  it("renders the view matching a freshly-received state, with no intermediate view first (FR-063)", async () => {
    mockAdminAndEvent();
    renderScreen();
    await screen.findByTestId("screen-route");
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    // Simulates a reconnect: the very first message this instance ever sees
    // already carries a non-waiting display plus cached results — the screen
    // must render that directly, not the default "waiting" view first.
    dispatchMessage(socket, {
      type: "state",
      eventStatus: "live",
      step: { id: "step-1", position: 1, timed: false, countdownSeconds: 0, status: "revealed", timerStartedAt: null },
      question: null,
      display: "results",
      controllerId: "admin-1",
      serverNow: new Date().toISOString(),
    });
    dispatchMessage(socket, {
      type: "step_results",
      stepId: "step-1",
      participants: [{ participantId: "p-1", isCorrect: true, points: 3 }],
      teams: [],
    });
    dispatchMessage(socket, {
      type: "rankings",
      individuals: [{ participantId: "p-1", displayName: "Alice", total: 3, rank: 1 }],
      teams: [],
    });

    expect(await screen.findByTestId("screen-results-view")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-waiting-view")).not.toBeInTheDocument();
  });

  it("shows an alert instead of connecting, for a signed-out visitor", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderScreen();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(socketInstances).toHaveLength(0);
  });

  it("shows an alert instead of connecting, for a non-admin identity", async () => {
    from.mockImplementation((table: string) => {
      if (table === "profile") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { is_admin: false }, error: null }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    renderScreen();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(socketInstances).toHaveLength(0);
  });
});
