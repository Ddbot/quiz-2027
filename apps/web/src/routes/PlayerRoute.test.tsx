import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange, maybeSingle, eq, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    maybeSingle,
    eq,
    from,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange },
    from,
  },
}));

getSession.mockResolvedValue({ data: { session: null } });
onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

const { PlayerRoute } = await import("@/routes/PlayerRoute");
const { AuthProvider } = await import("@/components/AuthProvider");

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/e/:joinCode" element={<PlayerRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("PlayerRoute — resolving the join code", () => {
  it("shows the event once the join code resolves", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "evt-1",
        join_code: "GOODCODE",
        title: "Friday Night Quiz",
        language: "en",
        status: "draft",
        venue_label: null,
      },
      error: null,
    });

    renderAt("/e/GOODCODE");

    await waitFor(() => expect(screen.getByTestId("event-title")).toHaveTextContent("Friday Night Quiz"));
    expect(from).toHaveBeenCalledWith("event_public_summary");
    expect(eq).toHaveBeenCalledWith("join_code", "GOODCODE");
  });

  it("shows a clear error for a code that doesn't resolve", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    renderAt("/e/NOPE");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/code introuvable/i);
  });
});
