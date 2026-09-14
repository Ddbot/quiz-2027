import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

const { EventEditorPage } = await import("@/routes/admin/EventEditorPage");

const BASE_EVENT = {
  id: "evt-1",
  join_code: "AAAAAA",
  title: "Soirée",
  language: "fr",
  venue_label: null,
  waiting_media_path: null,
  waiting_countdown_target: null,
  created_at: "2026-01-01T00:00:00Z",
};

function mockEventEditor(status: "draft" | "live") {
  from.mockImplementation((table: string) => {
    if (table === "event") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { ...BASE_EVENT, status }, error: null }),
          }),
        }),
      };
    }
    if (table === "step") {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/admin/events/evt-1"]}>
      <Routes>
        <Route path="/admin/events/:eventId" element={<EventEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventEditorPage — freeze-on-start guard", () => {
  it("shows editable controls for a draft event", async () => {
    mockEventEditor("draft");
    renderEditor();

    expect((await screen.findAllByRole("button", { name: /^enregistrer$/i })).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /ajouter une étape/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /supprimer l'événement/i })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows read-only content and no edit controls for a non-draft event", async () => {
    mockEventEditor("live");
    renderEditor();

    const notices = await screen.findAllByRole("note");
    expect(notices.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^enregistrer$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ajouter une étape/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /supprimer l'événement/i })).not.toBeInTheDocument();
    // Join code/QR still display — read-only doesn't hide informational content.
    expect(screen.getByTestId("join-code-value")).toHaveTextContent("AAAAAA");
  });
});
