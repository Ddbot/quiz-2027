import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { getSession, onAuthStateChange, from, rpc, channel } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
}));

// The moderation section (ModerationSection/useModeration) fetches via
// `supabase.from(...)` on mount, independently of the WebSocket connection
// the flow-control tests above exercise. A query that never resolves keeps
// its effect from throwing without affecting those tests' assertions — see
// mc:show_leaderboard/mc:end's own describe block for tests that DO exercise
// moderation content, where `from`/`rpc` are given real resolved values.
function pendingQuery(): PromiseLike<never> & Record<string, () => unknown> {
  const query = new Promise<never>(() => {}) as unknown as PromiseLike<never> & Record<string, () => unknown>;
  query.select = () => pendingQuery();
  query.eq = () => pendingQuery();
  return query;
}
from.mockImplementation(() => pendingQuery());
// The moderation section's realtime subscription — a chainable no-op stub,
// same rationale as `pendingQuery` above.
channel.mockImplementation(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, onAuthStateChange }, from, rpc, channel },
}));

const { AuthProvider } = await import("@/components/AuthProvider");
const { LiveControlPage } = await import("@/routes/admin/LiveControlPage");

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/events/evt-1/live"]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/events/:eventId/live" element={<LiveControlPage />} />
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
  from.mockImplementation(() => pendingQuery());
  vi.stubGlobal("open", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiveControlPage — MC console", () => {
  it("sends mc:claim_control when the claim button is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    await user.click(screen.getByRole("button", { name: /prendre le contrôle/i }));
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: "mc:claim_control", payload: undefined });
  });

  it("reflects a state update (control held) after claiming", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    await user.click(screen.getByRole("button", { name: /prendre le contrôle/i }));
    dispatchMessage(socket, {
      type: "state",
      eventStatus: "draft",
      step: null,
      question: null,
      display: "waiting",
      controllerId: "admin-1",
      serverNow: new Date().toISOString(),
    });

    await waitFor(() => expect(screen.getByTestId("control-status")).toHaveTextContent(/vous détenez/i));
  });

  it("sends mc:start once the controller starts the event", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    dispatchMessage(socket, {
      type: "state",
      eventStatus: "draft",
      step: null,
      question: null,
      display: "waiting",
      controllerId: "admin-1",
      serverNow: new Date().toISOString(),
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /démarrer l'événement/i })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /démarrer l'événement/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "mc:start", payload: undefined });
  });

  it("surfaces a server-sent error", async () => {
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    dispatchMessage(socket, { type: "error", code: "forbidden", message: "Only the current flow controller may do this" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/flow controller/i);
  });
});

describe("LiveControlPage — operator:display", () => {
  it("sends operator:display with the right view for each button", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    await user.click(screen.getByRole("button", { name: /^classement$/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "operator:display", payload: { view: "leaderboard" } });

    await user.click(screen.getByRole("button", { name: /^podium$/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "operator:display", payload: { view: "podium" } });
  });
});

describe("LiveControlPage — mc:show_leaderboard and mc:end", () => {
  async function makeLiveAndControlled(socket: InstanceType<typeof FakePartySocket>) {
    dispatchMessage(socket, {
      type: "state",
      eventStatus: "live",
      step: null,
      question: null,
      display: "waiting",
      controllerId: "admin-1",
      serverNow: new Date().toISOString(),
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /afficher le classement/i })).toBeEnabled());
  }

  it("sends mc:show_leaderboard", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;
    await makeLiveAndControlled(socket);

    await user.click(screen.getByRole("button", { name: /afficher le classement/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "mc:show_leaderboard", payload: undefined });
  });

  it("does not send mc:end when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;
    await makeLiveAndControlled(socket);

    await user.click(screen.getByRole("button", { name: /terminer l'événement/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(socket.sent.some((m) => JSON.parse(m).type === "mc:end")).toBe(false);
  });

  it("sends mc:end once the confirmation is accepted", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;
    await makeLiveAndControlled(socket);

    await user.click(screen.getByRole("button", { name: /terminer l'événement/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "mc:end", payload: undefined });
  });
});

describe("LiveControlPage — mc:kill_switch", () => {
  it("activates the kill switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    await user.click(screen.getByRole("button", { name: /activer le coupe-circuit/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "mc:kill_switch", payload: { on: true } });
  });

  it("clears the kill switch once active, and shows the active notice", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));
    const socket = socketInstances[0]!;

    dispatchMessage(socket, {
      type: "state",
      eventStatus: "live",
      step: null,
      question: null,
      display: "waiting",
      controllerId: "admin-1",
      killSwitch: true,
      serverNow: new Date().toISOString(),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/coupe-circuit est actif/i);
    await user.click(screen.getByRole("button", { name: /désactiver le coupe-circuit/i }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "mc:kill_switch", payload: { on: false } });
  });
});

describe("LiveControlPage — moderation section", () => {
  function mockRoster() {
    from.mockImplementation((table: string) => {
      if (table === "participant") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "p-1", display_name: "Alice", hidden: false }],
                error: null,
              }),
          }),
        };
      }
      if (table === "team") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [{ id: "t-1", name: "Alpha", hidden: false }], error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
  }

  it("lists participants and teams", async () => {
    mockRoster();
    renderPage();

    expect(await screen.findByTestId("moderation-row-p-1")).toHaveTextContent("Alice");
    expect(screen.getByTestId("moderation-row-t-1")).toHaveTextContent("Alpha");
  });

  it("renders for a draft event, not only a live one (design.md D5)", async () => {
    mockRoster();
    renderPage();
    const socket = await waitFor(() => {
      expect(socketInstances).toHaveLength(1);
      return socketInstances[0]!;
    });
    dispatchMessage(socket, {
      type: "state",
      eventStatus: "draft",
      step: null,
      question: null,
      display: "waiting",
      controllerId: null,
      serverNow: new Date().toISOString(),
    });

    expect(await screen.findByTestId("moderation-row-p-1")).toBeInTheDocument();
  });

  it("hides a participant via moderate_participant", async () => {
    mockRoster();
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByTestId("moderation-row-p-1");
    await user.click(within(row).getByRole("button", { name: /^masquer$/i }));

    expect(rpc).toHaveBeenCalledWith("moderate_participant", { p_participant_id: "p-1", p_hidden: true });
  });

  it("renames a team via moderate_team", async () => {
    mockRoster();
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByTestId("moderation-row-t-1");
    await user.click(within(row).getByRole("button", { name: /renommer/i }));
    const input = within(row).getByPlaceholderText(/nouveau nom/i);
    await user.clear(input);
    await user.type(input, "Beta");
    await user.click(within(row).getByRole("button", { name: /renommer/i }));

    expect(rpc).toHaveBeenCalledWith("moderate_team", { p_team_id: "t-1", p_name: "Beta" });
  });
});

describe("LiveControlPage — Operator caster (design.md D5)", () => {
  it("uses PresentationRequest when available", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const PresentationRequestMock = vi.fn().mockImplementation(function (this: unknown) {
      return { start };
    });
    vi.stubGlobal("PresentationRequest", PresentationRequestMock);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: /caster vers un écran/i }));
    expect(PresentationRequestMock).toHaveBeenCalledWith([expect.stringContaining("/screen/evt-1")]);
    expect(start).toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("falls back to window.open when PresentationRequest is unavailable", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(socketInstances).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: /caster vers un écran/i }));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining("/screen/evt-1"), "_blank");
  });
});
