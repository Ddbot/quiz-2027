import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

const { useExistingParticipant } = await import("@/routes/player/useExistingParticipant");

function fakeSession(userId: string) {
  return { user: { id: userId } } as unknown as import("@supabase/supabase-js").Session;
}

describe("useExistingParticipant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays loading while auth itself is still resolving (session undefined)", () => {
    const { result } = renderHook(() => useExistingParticipant("evt-1", undefined));
    expect(result.current.status).toBe("loading");
    expect(from).not.toHaveBeenCalled();
  });

  it("resolves not-found immediately when there is no session", async () => {
    const { result } = renderHook(() => useExistingParticipant("evt-1", null));
    await waitFor(() => expect(result.current.status).toBe("not-found"));
    expect(from).not.toHaveBeenCalled();
  });

  it("resolves found when a participant row already exists for this event/profile", async () => {
    from.mockImplementation((table: string) => {
      expect(table).toBe("participant");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: "p-1", display_name: "Alice" }, error: null }),
            }),
          }),
        }),
      };
    });

    const { result } = renderHook(() => useExistingParticipant("evt-1", fakeSession("u-1")));
    await waitFor(() => expect(result.current.status).toBe("found"));
    expect(result.current).toMatchObject({ participant: { id: "p-1", display_name: "Alice" } });
  });

  it("resolves not-found when no participant row exists", async () => {
    from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }));

    const { result } = renderHook(() => useExistingParticipant("evt-1", fakeSession("u-1")));
    await waitFor(() => expect(result.current.status).toBe("not-found"));
  });

  it("never re-checks once a session appears later, after already resolving with no session (mid-flow sign-in)", async () => {
    const { result, rerender } = renderHook(
      ({ session }: { session: Session | null | undefined }) => useExistingParticipant("evt-1", session),
      { initialProps: { session: null as Session | null | undefined } },
    );
    await waitFor(() => expect(result.current.status).toBe("not-found"));

    rerender({ session: fakeSession("u-1") });
    // Still not-found — the second render's session must not trigger a new
    // check that could otherwise leave the caller stuck on "loading".
    expect(result.current.status).toBe("not-found");
    expect(from).not.toHaveBeenCalled();
  });
});
