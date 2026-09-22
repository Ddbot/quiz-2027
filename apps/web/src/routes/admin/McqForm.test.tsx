import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

const { McqForm } = await import("@/routes/admin/McqForm");
import type { AdminStep } from "@/routes/admin/types";

const STEP: AdminStep = {
  id: "step-1",
  event_id: "evt-1",
  position: 1,
  timed: false,
  countdown_seconds: 0,
  points_correct: 1,
  team_award_points: 0,
  status: "pending",
  game_mcq: null,
};

function mockWrites() {
  const upsert = vi.fn<(payload: unknown) => Promise<{ error: null }>>(() =>
    Promise.resolve({ error: null }),
  );
  const stepEq = vi.fn(() => Promise.resolve({ error: null }));
  const update = vi.fn(() => ({ eq: stepEq }));
  from.mockImplementation((table: string) => {
    if (table === "game_mcq") return { upsert };
    if (table === "step") return { update };
    throw new Error(`unexpected table ${table}`);
  });
  return { upsert, update, stepEq };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("McqForm", () => {
  it("requires at least two options and disables removal at the floor", async () => {
    mockWrites();
    render(<McqForm step={STEP} mcq={null} readOnly={false} onSaved={vi.fn()} />);

    const removeButtons = screen.getAllByRole("button", { name: /^retirer$/i });
    expect(removeButtons).toHaveLength(2);
    for (const button of removeButtons) expect(button).toBeDisabled();
  });

  it("saves question, options, correct option, timer, and scoring", async () => {
    const { upsert, update, stepEq } = mockWrites();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<McqForm step={STEP} mcq={null} readOnly={false} onSaved={onSaved} />);

    await user.type(screen.getByLabelText(/^question$/i), "2 + 2 = ?");
    await user.type(screen.getByLabelText(/option 1/i), "3");
    await user.type(screen.getByLabelText(/option 2/i), "4");
    await user.click(screen.getByLabelText(/bonne réponse 2/i));

    await user.click(screen.getByLabelText(/étape chronométrée/i));
    const countdown = await screen.findByLabelText(/durée du compte à rebours/i);
    await user.clear(countdown);
    await user.type(countdown, "20");

    const pointsCorrect = screen.getByLabelText(/points pour une bonne réponse/i);
    await user.clear(pointsCorrect);
    await user.type(pointsCorrect, "2");

    const teamPoints = screen.getByLabelText(/points bonus pour l'équipe/i);
    await user.clear(teamPoints);
    await user.type(teamPoints, "5");

    await user.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const mcqPayload = upsert.mock.calls[0]![0] as {
      step_id: string;
      question_text: string;
      options: { id: string; label: string }[];
      correct_option_id: string;
    };
    expect(mcqPayload.step_id).toBe("step-1");
    expect(mcqPayload.question_text).toBe("2 + 2 = ?");
    expect(mcqPayload.options.map((o) => o.label)).toEqual(["3", "4"]);
    expect(mcqPayload.correct_option_id).toBe(mcqPayload.options[1]!.id);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        timed: true,
        countdown_seconds: 20,
        points_correct: 2,
        team_award_points: 5,
      }),
    );
    expect(stepEq).toHaveBeenCalledWith("id", "step-1");
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows a hint while team award points is 0, and hides it once set otherwise", async () => {
    mockWrites();
    const user = userEvent.setup();
    render(<McqForm step={STEP} mcq={null} readOnly={false} onSaved={vi.fn()} />);

    expect(screen.getByText(/aucun bonus d'équipe/i)).toBeInTheDocument();

    const teamPoints = screen.getByLabelText(/points bonus pour l'équipe/i);
    await user.clear(teamPoints);
    await user.type(teamPoints, "5");

    expect(screen.queryByText(/aucun bonus d'équipe/i)).not.toBeInTheDocument();
  });

  it("rejects submission without a designated correct option", async () => {
    mockWrites();
    const user = userEvent.setup();
    render(<McqForm step={STEP} mcq={null} readOnly={false} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(/^question$/i), "Q?");
    await user.type(screen.getByLabelText(/option 1/i), "A");
    await user.type(screen.getByLabelText(/option 2/i), "B");
    await user.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/bonne réponse/i);
  });

  it("shows read-only content once the event leaves draft", () => {
    mockWrites();
    render(
      <McqForm
        step={STEP}
        mcq={{ step_id: "step-1", question_text: "2 + 2 = ?", options: [], correct_option_id: "" }}
        readOnly
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(/lecture seule/i);
    expect(screen.queryByRole("button", { name: /ajouter une option/i })).not.toBeInTheDocument();
  });
});
