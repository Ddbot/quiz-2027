import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange, signInWithPassword } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signInWithPassword },
  },
}));

const { AuthProvider } = await import("@/components/AuthProvider");
const { AdminSignInForm } = await import("@/routes/admin/AdminSignInForm");

function renderForm() {
  return render(
    <AuthProvider>
      <AdminSignInForm />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("AdminSignInForm", () => {
  it("signs in with email and password", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), "admin@example.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "admin@example.com",
        password: "correct-password",
      }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error on invalid credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), "admin@example.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/identifiants invalides/i);
  });
});
