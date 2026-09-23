import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange, signOut, rpc } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, onAuthStateChange, signOut }, rpc },
}));

const { AuthProvider } = await import("@/components/AuthProvider");
const { AccountRoute } = await import("@/routes/AccountRoute");

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={["/account"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>landing</p>} />
          <Route path="/account" element={<AccountRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountRoute — signed out", () => {
  it("shows a signed-out notice instead of the account content", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderAccount();

    expect(await screen.findByRole("alert")).toHaveTextContent(/connecté/i);
    expect(screen.queryByRole("button", { name: /exporter mes données/i })).not.toBeInTheDocument();
  });
});

describe("AccountRoute — signed in", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "tok", user: { id: "u-1" } } },
    });
  });

  it("signs out and navigates home when the sign-out button is clicked", async () => {
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole("button", { name: /^se déconnecter$/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText("landing")).toBeInTheDocument();
  });

  it("exports data and displays it on request", async () => {
    const exportPayload = { profile: { id: "u-1" }, participants: [], answers: [] };
    rpc.mockResolvedValue({ data: exportPayload, error: null });
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole("button", { name: /exporter mes données/i }));
    expect(rpc).toHaveBeenCalledWith("export_my_data");
    expect(await screen.findByTestId("account-export-output")).toHaveTextContent(/"id": "u-1"/);
  });

  it("does not call delete_my_account when confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole("button", { name: /supprimer mon compte/i }));
    expect(rpc).not.toHaveBeenCalledWith("delete_my_account");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("deletes the account and signs out once confirmation is accepted", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    rpc.mockResolvedValue({ data: null, error: null });
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole("button", { name: /supprimer mon compte/i }));
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText("landing")).toBeInTheDocument();
  });
});
