import { render, screen, waitFor } from "@testing-library/react";
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

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
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
