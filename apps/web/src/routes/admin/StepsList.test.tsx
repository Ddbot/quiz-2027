import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

const { StepsList } = await import("@/routes/admin/StepsList");
import type { AdminEvent, AdminStep } from "@/routes/admin/types";

const EVENT: AdminEvent = {
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

function step(id: string, position: number, questionText: string | null = null): AdminStep {
  return {
    id,
    event_id: EVENT.id,
    position,
    timed: false,
    countdown_seconds: 0,
    points_correct: 1,
    team_award_points: 0,
    status: "pending",
    game_mcq: questionText === null ? null : { question_text: questionText },
  };
}

function mockCalls() {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
  const del = vi.fn(() => ({ eq: deleteEq }));
  const updateEq = vi.fn(() => Promise.resolve({ error: null }));
  const update = vi.fn<(payload: unknown) => { eq: typeof updateEq }>(() => ({ eq: updateEq }));

  from.mockReturnValue({ insert, delete: del, update });
  return { insert, del, deleteEq, update, updateEq };
}

function renderList(steps: AdminStep[], readOnly = false, onChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <StepsList event={EVENT} steps={steps} readOnly={readOnly} onChange={onChange} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StepsList", () => {
  it("adds a step appended at the next position", async () => {
    const { insert } = mockCalls();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderList([step("s1", 1)], false, onChange);

    await user.click(screen.getByRole("button", { name: /ajouter une étape/i }));

    await waitFor(() => expect(insert).toHaveBeenCalledWith({ event_id: EVENT.id, position: 2 }));
    expect(onChange).toHaveBeenCalled();
  });

  it("removes a step", async () => {
    const { deleteEq } = mockCalls();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderList([step("s1", 1), step("s2", 2)], false, onChange);

    const [firstRemove] = screen.getAllByRole("button", { name: /^supprimer$/i });
    await user.click(firstRemove!);

    await waitFor(() => expect(deleteEq).toHaveBeenCalledWith("id", "s1"));
    expect(onChange).toHaveBeenCalled();
  });

  it("reorders steps by swapping positions through a sentinel value", async () => {
    const { update, updateEq } = mockCalls();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderList([step("s1", 1), step("s2", 2)], false, onChange);

    await user.click(screen.getByRole("button", { name: /descendre 1/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
    expect(update.mock.calls[0]![0]).toEqual({ position: 0 });
    expect(updateEq.mock.calls[0]).toEqual(["id", "s1"]);
    expect(update.mock.calls[1]![0]).toEqual({ position: 1 });
    expect(updateEq.mock.calls[1]).toEqual(["id", "s2"]);
    expect(update.mock.calls[2]![0]).toEqual({ position: 2 });
    expect(updateEq.mock.calls[2]).toEqual(["id", "s1"]);
    expect(onChange).toHaveBeenCalled();
  });

  it("hides add/remove/reorder controls when read-only", () => {
    mockCalls();
    renderList([step("s1", 1)], true);

    expect(screen.queryByRole("button", { name: /ajouter une étape/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^supprimer$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /modifier/i })).toBeInTheDocument();
  });

  it("shows the step's real question text once authored", () => {
    mockCalls();
    renderList([step("s1", 1, "2 + 2 = ?")]);

    expect(screen.getByText("1. 2 + 2 = ?")).toBeInTheDocument();
  });

  it("falls back to a generic label before the step has any question content", () => {
    mockCalls();
    renderList([step("s1", 1)]);

    expect(screen.getByText("1. Étape")).toBeInTheDocument();
  });
});
