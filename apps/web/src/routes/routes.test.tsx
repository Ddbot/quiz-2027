import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange },
    // Never resolves in this file — these tests only care about routes that
    // don't depend on the join-code resolution outcome. PlayerRoute.test.tsx
    // covers the resolved/invalid states.
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(() => {}) }) }) }),
  },
}));

getSession.mockResolvedValue({ data: { session: null } });
onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

const { App } = await import("@/App");
const { AuthProvider } = await import("@/components/AuthProvider");

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("route shells", () => {
  it("the root path is a join-code landing page, not an admin redirect", () => {
    renderAt("/");
    expect(screen.getByLabelText(/code de participation/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /administration/i })).not.toBeInTheDocument();
  });

  it("submitting a join code on the landing page navigates to /e/:code", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.type(screen.getByLabelText(/code de participation/i), "abcd12");
    await user.click(screen.getByRole("button", { name: /rejoindre/i }));

    expect(screen.getByTestId("join-code")).toHaveTextContent("ABCD12");
  });

  it("the landing page links to admin sign-in", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: /organisateur/i })).toHaveAttribute("href", "/admin");
  });

  it("player route reads the join code from the URL", () => {
    renderAt("/e/ABCD12");
    expect(screen.getByTestId("join-code")).toHaveTextContent("ABCD12");
  });

  it("admin route renders its placeholder", () => {
    renderAt("/admin");
    expect(screen.getByRole("heading", { name: /administration/i })).toBeInTheDocument();
  });

  it("screen route requires an admin session (design.md D1, big-screen-presentation) — a signed-out visitor sees no event content", async () => {
    renderAt("/screen/evt_123");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-route")).not.toBeInTheDocument();
  });
});
