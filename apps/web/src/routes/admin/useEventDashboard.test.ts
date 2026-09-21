import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
}));

const { useEventDashboard } = await import("@/routes/admin/useEventDashboard");

const DASHBOARD = {
  participant_count: 3,
  completion_rate: 0.875,
  per_question: [{ step_id: "s-1", correct: 2, incorrect: 1 }],
  avg_response_ms: 2000,
  final_participants: [{ participant_id: "p-1", display_name: "Alice", total_points: 10, rank: 1 }],
  final_teams: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useEventDashboard", () => {
  it("calls event_dashboard with the event id and returns the result", async () => {
    rpc.mockResolvedValue({ data: DASHBOARD, error: null });
    const { result } = renderHook(() => useEventDashboard("evt-1"));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(rpc).toHaveBeenCalledWith("event_dashboard", { p_event_id: "evt-1" });
    expect(result.current).toMatchObject({ status: "loaded", dashboard: DASHBOARD });
  });

  it("returns an error state when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    const { result } = renderHook(() => useEventDashboard("evt-1"));

    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
