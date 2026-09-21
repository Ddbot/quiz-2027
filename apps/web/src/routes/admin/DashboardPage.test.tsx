import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
}));

const { DashboardPage } = await import("@/routes/admin/DashboardPage");

const DASHBOARD = {
  participant_count: 3,
  completion_rate: 0.875,
  per_question: [
    { step_id: "s-1", correct: 2, incorrect: 0 },
    { step_id: "s-2", correct: 2, incorrect: 1 },
  ],
  avg_response_ms: 2500,
  final_participants: [
    { participant_id: "p-1", display_name: "Alice", total_points: 15, rank: 1 },
    { participant_id: "p-2", display_name: "Bob", total_points: 10, rank: 2 },
  ],
  final_teams: [{ team_id: "t-1", name: "Alpha", total_awarded: 5, rank: 1 }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/events/evt-1/dashboard"]}>
      <Routes>
        <Route path="/admin/events/:eventId/dashboard" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("renders every dashboard figure from a fixture response", async () => {
    rpc.mockResolvedValue({ data: DASHBOARD, error: null });
    renderPage();

    expect(await screen.findByTestId("dashboard-participant-count")).toHaveTextContent("3");
    expect(screen.getByTestId("dashboard-completion-rate")).toHaveTextContent("88%");
    expect(screen.getByTestId("dashboard-avg-response-time")).toHaveTextContent("2.5");

    expect(screen.getByTestId("dashboard-question-s-1")).toHaveTextContent("2");
    expect(screen.getByTestId("dashboard-question-s-2")).toHaveTextContent("2");

    expect(screen.getByTestId("dashboard-final-participant-p-1")).toHaveTextContent("Alice");
    expect(screen.getByTestId("dashboard-final-participant-p-1")).toHaveTextContent("15");
    expect(screen.getByTestId("dashboard-final-team-t-1")).toHaveTextContent("Alpha");
  });

  it("shows an error message when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être chargé/i);
  });
});
