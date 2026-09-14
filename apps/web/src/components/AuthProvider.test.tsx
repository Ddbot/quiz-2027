import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAuth } from "@/hooks/useAuth";

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange },
  },
}));

// Imported after the mock so the module under test picks up the mocked client.
const { AuthProvider } = await import("@/components/AuthProvider");

function Consumer() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p>{user ? `signed in: ${user.email}` : "signed out"}</p>;
}

describe("AuthProvider / useAuth", () => {
  it("starts loading, then reflects the initial session, then a session-state change", async () => {
    let authChangeCallback: (event: string, session: unknown) => void = () => {};
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockImplementation((cb: typeof authChangeCallback) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("signed out")).toBeInTheDocument());

    act(() => {
      authChangeCallback("SIGNED_IN", { user: { email: "player@example.com" } });
    });

    await waitFor(() =>
      expect(screen.getByText("signed in: player@example.com")).toBeInTheDocument(),
    );
  });
});
