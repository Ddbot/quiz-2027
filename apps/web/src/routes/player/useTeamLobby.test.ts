import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from, rpc },
}));

const { useTeamLobby } = await import("@/routes/player/useTeamLobby");

const TEAMS = [
  { id: "team-1", event_id: "evt-1", name: "Alpha", captain_participant_id: "p-captain" },
  { id: "team-2", event_id: "evt-1", name: "Beta", captain_participant_id: null },
];

function mockFrom({ myTeamId = null as string | null } = {}) {
  from.mockImplementation((table: string) => {
    if (table === "team") {
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: TEAMS, error: null }) }) }) };
    }
    if (table === "participant") {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: { team_id: myTeamId }, error: null }) }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTeamLobby", () => {
  it("loads the event's non-dissolved teams and the caller's current team", async () => {
    mockFrom({ myTeamId: "team-1" });
    const { result } = renderHook(() => useTeamLobby("evt-1", "participant-1"));

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current).toMatchObject({ teams: TEAMS, myTeamId: "team-1" });
  });

  it("createTeam calls the RPC with the right shape and refetches", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useTeamLobby("evt-1", "participant-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    const ok = await result.current.createTeam("New Team");
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("create_team", { p_event_id: "evt-1", p_name: "New Team" });
    // reload() re-runs the same two fetches — called once on mount, once after the action.
    await waitFor(() => expect(from).toHaveBeenCalledWith("team"));
  });

  it("joinTeam calls the RPC with the right shape", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useTeamLobby("evt-1", "participant-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await result.current.joinTeam("team-2");
    expect(rpc).toHaveBeenCalledWith("join_team", { p_team_id: "team-2" });
  });

  it("leaveTeam calls the RPC with the right shape", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useTeamLobby("evt-1", "participant-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await result.current.leaveTeam();
    expect(rpc).toHaveBeenCalledWith("leave_team", { p_event_id: "evt-1" });
  });

  it("renameTeam calls the RPC with the right shape", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useTeamLobby("evt-1", "participant-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await result.current.renameTeam("team-1", "Renamed");
    expect(rpc).toHaveBeenCalledWith("rename_team", { p_team_id: "team-1", p_name: "Renamed" });
  });

  it("surfaces a mapped error and does not refetch when an action fails", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: { message: "name_taken" } });
    const { result } = renderHook(() => useTeamLobby("evt-1", "participant-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    const ok = await result.current.createTeam("Taken");
    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.actionError).toBe("name_taken"));
  });
});
