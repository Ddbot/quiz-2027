import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventSummary } from "@/routes/player/types";

const {
  getSession,
  onAuthStateChange,
  signInAnonymously,
  signUp,
  signInWithPassword,
  rpc,
  from,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInAnonymously: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

// The team-lobby step (rendered once joined, for a draft event) fetches via
// `supabase.from(...)` on mount. These tests don't exercise team-lobby
// content (see TeamLobbyStep.test.tsx for that) — a query that never
// resolves is enough to keep its effect from throwing.
function pendingQuery(): PromiseLike<never> & Record<string, () => unknown> {
  const query = new Promise<never>(() => {}) as unknown as PromiseLike<never> &
    Record<string, () => unknown>;
  query.select = () => pendingQuery();
  query.eq = () => pendingQuery();
  query.single = () => pendingQuery();
  return query;
}
from.mockImplementation(() => pendingQuery());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signInAnonymously, signUp, signInWithPassword },
    rpc,
    from,
  },
}));

getSession.mockResolvedValue({ data: { session: null } });
onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

const { OnboardingFlow } = await import("@/routes/player/OnboardingFlow");
const { AuthProvider } = await import("@/components/AuthProvider");
const { TermsRoute } = await import("@/routes/legal/TermsRoute");
const { PrivacyRoute } = await import("@/routes/legal/PrivacyRoute");

const draftEventFr = {
  id: "evt-1",
  join_code: "ABC123",
  title: "Soirée Quiz",
  language: "fr" as const,
  status: "draft" as const,
  venue_label: null,
};

function renderFlow(event: EventSummary = draftEventFr) {
  return render(
    <MemoryRouter initialEntries={["/e/" + event.join_code]}>
      <AuthProvider>
        <Routes>
          <Route path="/e/:joinCode" element={<OnboardingFlow event={event} />} />
          <Route path="/legal/terms" element={<TermsRoute />} />
          <Route path="/legal/privacy" element={<PrivacyRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("OnboardingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    from.mockImplementation(() => pendingQuery());
  });

  it("links the consent checkbox to the Terms and Privacy pages", () => {
    renderFlow();

    expect(screen.getByRole("link", { name: /conditions d'utilisation/i })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    expect(screen.getByRole("link", { name: /politique de confidentialité/i })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
  });

  it("blocks the anonymous path until both required consent boxes are checked", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText(/nom affiché/i), "Alice");
    await user.click(screen.getByRole("button", { name: /continuer/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/obligatoires/i);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("joins anonymously once consent is given, through confirm-name to a successful join", async () => {
    const user = userEvent.setup();
    signInAnonymously.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({
      data: { participant: { id: "p-1", display_name: "Alice" }, event: { id: draftEventFr.id } },
      error: null,
    });

    renderFlow();

    await user.type(screen.getByLabelText(/nom affiché/i), "Alice");
    await user.click(screen.getByLabelText(/plus de 16 ans/i));
    await user.click(screen.getByLabelText(/conditions d'utilisation/i));
    await user.click(screen.getByRole("button", { name: /continuer/i }));

    expect(await screen.findByTestId("confirm-display-name")).toHaveTextContent("Alice");

    await user.click(screen.getByRole("button", { name: /confirmer et rejoindre/i }));

    await waitFor(() =>
      expect(screen.getByTestId("joined-display-name")).toHaveTextContent("Alice"),
    );
    expect(rpc).toHaveBeenCalledWith("join_event", {
      p_join_code: "ABC123",
      p_display_name: "Alice",
      p_over16_ack: true,
      p_marketing_consent: false,
    });
  });

  it("shows the team-lobby step once joined, for a draft event", async () => {
    const user = userEvent.setup();
    signInAnonymously.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({
      data: { participant: { id: "p-1", display_name: "Alice" }, event: { id: draftEventFr.id } },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "team") {
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === "participant") {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: { team_id: null }, error: null }) }),
          }),
        };
      }
      return pendingQuery();
    });

    renderFlow(draftEventFr);

    await user.type(screen.getByLabelText(/nom affiché/i), "Alice");
    await user.click(screen.getByLabelText(/plus de 16 ans/i));
    await user.click(screen.getByLabelText(/conditions d'utilisation/i));
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    await user.click(screen.getByRole("button", { name: /confirmer et rejoindre/i }));

    await waitFor(() => expect(screen.getByTestId("joined-display-name")).toHaveTextContent("Alice"));
    expect(await screen.findByRole("heading", { name: /équipe/i })).toBeInTheDocument();
  });

  it("does not show the team-lobby step once joined, for a live event", async () => {
    const liveEventFr = { ...draftEventFr, status: "live" as const };
    const user = userEvent.setup();
    signInAnonymously.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({
      data: { participant: { id: "p-1", display_name: "Alice" }, event: { id: liveEventFr.id } },
      error: null,
    });

    renderFlow(liveEventFr);

    await user.type(screen.getByLabelText(/nom affiché/i), "Alice");
    await user.click(screen.getByLabelText(/plus de 16 ans/i));
    await user.click(screen.getByLabelText(/conditions d'utilisation/i));
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    await user.click(screen.getByRole("button", { name: /confirmer et rejoindre/i }));

    await waitFor(() => expect(screen.getByTestId("joined-display-name")).toHaveTextContent("Alice"));
    expect(screen.queryByRole("heading", { name: /équipe/i })).not.toBeInTheDocument();
  });

  it("account creation succeeds with marketing consent left unchecked", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    rpc.mockResolvedValue({
      data: { participant: { id: "p-2", display_name: "Bob" }, event: { id: draftEventFr.id } },
      error: null,
    });

    renderFlow();

    await user.click(screen.getByRole("button", { name: /créer un compte/i }));
    await user.type(screen.getByLabelText(/nom affiché/i), "Bob");
    await user.type(screen.getByLabelText(/^adresse e-mail$/i), "bob@example.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/plus de 16 ans/i));
    await user.click(screen.getByLabelText(/conditions d'utilisation/i));
    // marketing consent left unchecked deliberately
    await user.click(screen.getByRole("button", { name: /continuer/i }));

    await user.click(await screen.findByRole("button", { name: /confirmer et rejoindre/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith(
      "join_event",
      expect.objectContaining({ p_marketing_consent: false }),
    );
  });

  it("shows the check-your-email screen when signup requires confirmation", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ data: { session: null }, error: null });

    renderFlow();

    await user.click(screen.getByRole("button", { name: /créer un compte/i }));
    await user.type(screen.getByLabelText(/nom affiché/i), "Carol");
    await user.type(screen.getByLabelText(/^adresse e-mail$/i), "carol@example.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/plus de 16 ans/i));
    await user.click(screen.getByLabelText(/conditions d'utilisation/i));
    await user.click(screen.getByRole("button", { name: /continuer/i }));

    expect(await screen.findByText(/vérifiez votre e-mail/i)).toBeInTheDocument();
  });

  it("sign-in shows no consent checkboxes", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(screen.queryByLabelText(/plus de 16 ans/i)).not.toBeInTheDocument();
  });

  it("lets the player retry with a new name after a profanity rejection, without redoing identity", async () => {
    const user = userEvent.setup();
    signInAnonymously.mockResolvedValue({ error: null });
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "profanity" } })
      .mockResolvedValueOnce({
        data: { participant: { id: "p-3", display_name: "NicerName" }, event: { id: draftEventFr.id } },
        error: null,
      });

    renderFlow();

    await user.type(screen.getByLabelText(/nom affiché/i), "RudeName");
    await user.click(screen.getByLabelText(/plus de 16 ans/i));
    await user.click(screen.getByLabelText(/conditions d'utilisation/i));
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    await user.click(await screen.findByRole("button", { name: /confirmer et rejoindre/i }));

    const nameInput = await screen.findByLabelText(/nom affiché/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/n'est pas autorisé/i);
    await user.clear(nameInput);
    await user.type(nameInput, "NicerName");
    await user.click(screen.getByRole("button", { name: /réessayer/i }));

    await waitFor(() =>
      expect(screen.getByTestId("joined-display-name")).toHaveTextContent("NicerName"),
    );
    // identity was never re-collected — signInAnonymously only ran once
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("renders English copy for an English event", async () => {
    renderFlow({ ...draftEventFr, language: "en" });
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByText(/how would you like to join/i)).toBeInTheDocument();
  });
});
