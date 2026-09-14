import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

const { EventDetailsForm } = await import("@/routes/admin/EventDetailsForm");
import type { AdminEvent } from "@/routes/admin/types";

const DRAFT_EVENT: AdminEvent = {
  id: "evt-1",
  join_code: "AAAAAA",
  title: "Soirée",
  language: "fr",
  status: "draft",
  venue_label: null,
  waiting_media_path: null,
  waiting_countdown_target: null,
  created_at: "2026-01-01T00:00:00Z",
};

function mockUpdate(result: { data: unknown; error: unknown }) {
  const single = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  from.mockReturnValue({ update });
  return { update, eq };
}

describe("EventDetailsForm", () => {
  it("saves updated title/language/venue for a draft event", async () => {
    const { update } = mockUpdate({
      data: { ...DRAFT_EVENT, title: "Nouveau titre", venue_label: "Salle A" },
      error: null,
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EventDetailsForm event={DRAFT_EVENT} readOnly={false} onSaved={onSaved} />);

    await user.clear(screen.getByLabelText(/^titre$/i));
    await user.type(screen.getByLabelText(/^titre$/i), "Nouveau titre");
    await user.type(screen.getByLabelText(/lieu/i), "Salle A");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nouveau titre", venue_label: "Salle A" }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows the read-only notice instead of a form once the event leaves draft", () => {
    render(
      <EventDetailsForm
        event={{ ...DRAFT_EVENT, status: "live" }}
        readOnly
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(/lecture seule/i);
    expect(screen.queryByRole("button", { name: /enregistrer/i })).not.toBeInTheDocument();
  });

  it("surfaces the can-no-longer-be-edited message when the write is rejected by RLS", async () => {
    mockUpdate({ data: null, error: { code: "PGRST116", message: "no rows" } });
    const user = userEvent.setup();
    render(<EventDetailsForm event={DRAFT_EVENT} readOnly={false} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ne peut plus être modifié/i);
  });

  it("shows a generic error for a non-RLS failure", async () => {
    mockUpdate({ data: null, error: { code: "23505", message: "conflict" } });
    const user = userEvent.setup();
    render(<EventDetailsForm event={DRAFT_EVENT} readOnly={false} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/enregistrement a échoué/i);
  });
});
