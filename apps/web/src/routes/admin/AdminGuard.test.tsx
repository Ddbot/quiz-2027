import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange, from, signOut } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signOut },
    from,
  },
}));

const { AuthProvider } = await import("@/components/AuthProvider");
const { AdminGuard } = await import("@/routes/admin/AdminGuard");

function renderGuard() {
  return render(
    <AuthProvider>
      <AdminGuard>
        <p>Console content</p>
      </AdminGuard>
    </AuthProvider>,
  );
}

function mockProfile(isAdmin: boolean) {
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: { is_admin: isAdmin }, error: null }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("AdminGuard", () => {
  it("shows sign-in for a signed-out visitor", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderGuard();

    expect(await screen.findByRole("heading", { name: /connexion/i })).toBeInTheDocument();
    expect(screen.queryByText("Console content")).not.toBeInTheDocument();
  });

  it("denies console content to a non-admin identity", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" }, access_token: "tok" } },
    });
    mockProfile(false);
    renderGuard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/accès refusé/i);
    expect(screen.queryByText("Console content")).not.toBeInTheDocument();
  });

  it("renders console content for an admin identity", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "admin-1" }, access_token: "tok" } },
    });
    mockProfile(true);
    renderGuard();

    expect(await screen.findByText("Console content")).toBeInTheDocument();
  });
});
