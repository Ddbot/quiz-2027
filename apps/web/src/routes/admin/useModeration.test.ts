import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from, rpc },
}));

const { useModeration } = await import("@/routes/admin/useModeration");

const PARTICIPANTS = [{ id: "p-1", display_name: "Alice", hidden: false }];
const TEAMS = [{ id: "t-1", name: "Alpha", hidden: false }];

function mockFrom() {
  from.mockImplementation((table: string) => {
    if (table === "participant") {
      return { select: () => ({ eq: () => Promise.resolve({ data: PARTICIPANTS, error: null }) }) };
    }
    if (table === "team") {
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: TEAMS, error: null }) }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useModeration", () => {
  it("loads the event's participants and non-dissolved teams", async () => {
    mockFrom();
    const { result } = renderHook(() => useModeration("evt-1"));

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current).toMatchObject({ participants: PARTICIPANTS, teams: TEAMS });
  });

  it("setParticipantHidden calls moderate_participant with the right shape and reloads", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useModeration("evt-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    const ok = await result.current.setParticipantHidden("p-1", true);
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("moderate_participant", { p_participant_id: "p-1", p_hidden: true });
    await waitFor(() => expect(from).toHaveBeenCalledWith("participant"));
  });

  it("renameParticipant calls moderate_participant with the right shape", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useModeration("evt-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await result.current.renameParticipant("p-1", "NewName");
    expect(rpc).toHaveBeenCalledWith("moderate_participant", { p_participant_id: "p-1", p_display_name: "NewName" });
  });

  it("setTeamHidden calls moderate_team with the right shape", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useModeration("evt-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await result.current.setTeamHidden("t-1", true);
    expect(rpc).toHaveBeenCalledWith("moderate_team", { p_team_id: "t-1", p_hidden: true });
  });

  it("renameTeam calls moderate_team with the right shape", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useModeration("evt-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await result.current.renameTeam("t-1", "Beta");
    expect(rpc).toHaveBeenCalledWith("moderate_team", { p_team_id: "t-1", p_name: "Beta" });
  });

  it("returns false and does not reload when an RPC fails", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: { message: "forbidden" } });
    const { result } = renderHook(() => useModeration("evt-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    const ok = await result.current.setParticipantHidden("p-1", true);
    expect(ok).toBe(false);
  });
});
