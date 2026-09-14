import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

const { EventListPage } = await import("@/routes/admin/EventListPage");

const EXISTING_EVENTS = [
  { id: "evt-1", title: "Soirée quiz", join_code: "AAAAAA", status: "draft" },
  { id: "evt-2", title: "Ancien événement", join_code: "BBBBBB", status: "ended" },
];

function mockFrom({
  events = EXISTING_EVENTS,
  insertResult,
  deleteResult,
}: {
  events?: typeof EXISTING_EVENTS;
  insertResult?: { data: unknown; error: unknown };
  deleteResult?: { error: unknown };
}) {
  const insertSingle = vi.fn(() => Promise.resolve(insertResult));
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn<(payload: unknown) => { select: typeof insertSelect }>(() => ({
    select: insertSelect,
  }));

  const deleteEq = vi.fn(() => Promise.resolve(deleteResult ?? { error: null }));
  const del = vi.fn(() => ({ eq: deleteEq }));

  const order = vi.fn(() => Promise.resolve({ data: events, error: null }));
  const select = vi.fn(() => ({ order }));

  from.mockReturnValue({ select, insert, delete: del });
  return { insert, del, deleteEq };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EventListPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventListPage", () => {
  it("lists each event with its title and status", async () => {
    mockFrom({});
    renderPage();

    expect(await screen.findByText("Soirée quiz")).toBeInTheDocument();
    expect(screen.getByText(/brouillon/i)).toBeInTheDocument();
    expect(screen.getByText("Ancien événement")).toBeInTheDocument();
    expect(screen.getByText(/terminé/i)).toBeInTheDocument();
  });

  it("creates a new draft event with a generated join code", async () => {
    const { insert } = mockFrom({
      insertResult: {
        data: { id: "evt-3", title: "Nouveau", join_code: "CCCCCC", status: "draft" },
        error: null,
      },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Soirée quiz");

    await user.type(screen.getByLabelText(/^titre$/i), "Nouveau");
    await user.click(screen.getByRole("button", { name: /^créer$/i }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const payload = insert.mock.calls[0]![0] as { title: string; join_code: string; status: string };
    expect(payload.title).toBe("Nouveau");
    expect(payload.status).toBe("draft");
    expect(payload.join_code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("deletes a draft event after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { deleteEq } = mockFrom({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Soirée quiz");

    await user.click(screen.getByRole("button", { name: /supprimer l'événement/i }));

    await waitFor(() => expect(deleteEq).toHaveBeenCalledWith("id", "evt-1"));
  });

  it("does not offer a delete control for a non-draft event", async () => {
    mockFrom({});
    renderPage();
    await screen.findByText("Ancien événement");

    const endedRow = screen.getByText("Ancien événement").closest("li");
    expect(endedRow).not.toBeNull();
    expect(endedRow!.querySelector("button")).toBeNull();
  });
});
