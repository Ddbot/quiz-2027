import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}));

const { AuthProvider } = await import("@/components/AuthProvider");
const { JoinCodeLandingRoute } = await import("@/routes/JoinCodeLandingRoute");

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<JoinCodeLandingRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("JoinCodeLandingRoute — account link (gdpr-season-capture)", () => {
  it("shows no account link when signed out", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderLanding();

    await screen.findByRole("button", { name: /rejoindre/i });
    expect(screen.queryByRole("link", { name: /gérer mon compte/i })).not.toBeInTheDocument();
  });

  it("shows the account link, pointing at /account, when signed in", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "tok", user: { id: "u-1" } } },
    });
    renderLanding();

    expect(await screen.findByRole("link", { name: /gérer mon compte/i })).toHaveAttribute("href", "/account");
  });
});
