import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc, channel, realtimeCallbacks } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  // Captures each table's postgres_changes callback so a test can trigger
  // one directly, standing in for a real Postgres change arriving.
  realtimeCallbacks: new Map<string, () => void>(),
}));

channel.mockImplementation(() => {
  const channelStub = {
    on: vi.fn((_event: string, config: { table: string }, callback: () => void) => {
      realtimeCallbacks.set(config.table, callback);
      return channelStub;
    }),
    subscribe: vi.fn(() => channelStub),
    unsubscribe: vi.fn(),
  };
  return channelStub;
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from, rpc, channel },
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
  realtimeCallbacks.clear();
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

  it("refetches when a Postgres change arrives on participant, without any admin action (production feedback)", async () => {
    mockFrom();
    const { result } = renderHook(() => useModeration("evt-1"));
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    expect(from).toHaveBeenCalledTimes(2); // initial load: participant + team
    const onParticipantChange = realtimeCallbacks.get("participant");
    expect(onParticipantChange).toBeTypeOf("function");

    onParticipantChange?.();
    await waitFor(() => expect(from).toHaveBeenCalledTimes(4)); // reload: participant + team again
  });

  it("subscribes with a filter scoped to the event", () => {
    mockFrom();
    renderHook(() => useModeration("evt-1"));

    const onCalls = (channel.mock.results[0]?.value as { on: ReturnType<typeof vi.fn> }).on.mock.calls;
    expect(onCalls).toEqual([
      [
        "postgres_changes",
        { event: "*", schema: "public", table: "participant", filter: "event_id=eq.evt-1" },
        expect.any(Function),
      ],
      [
        "postgres_changes",
        { event: "*", schema: "public", table: "team", filter: "event_id=eq.evt-1" },
        expect.any(Function),
      ],
    ]);
  });
});
