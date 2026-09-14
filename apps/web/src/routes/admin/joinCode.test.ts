import { describe, expect, it, vi } from "vitest";

import { createDraftEvent, generateJoinCode } from "@/routes/admin/joinCode";

describe("generateJoinCode", () => {
  it("generates a 6-character code from the allowed alphabet", () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });
});

function fakeSupabase(insertImpl: () => { data: unknown; error: { code?: string; message: string } | null }) {
  const single = vi.fn(() => Promise.resolve(insertImpl()));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn<(payload: unknown) => { select: typeof select }>(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { supabase: { from } as never, insert };
}

describe("createDraftEvent", () => {
  it("inserts a draft event with a generated join code", async () => {
    const { supabase, insert } = fakeSupabase(() => ({
      data: { id: "evt-1", join_code: "ABCDEF", title: "Soirée", status: "draft" },
      error: null,
    }));

    const { data, error } = await createDraftEvent(supabase, {
      title: "Soirée",
      language: "fr",
      venue_label: null,
    });

    expect(error).toBeNull();
    expect(data?.join_code).toBe("ABCDEF");
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0]![0] as { join_code: string; status: string };
    expect(payload.status).toBe("draft");
    expect(payload.join_code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("retries with a new code on a unique-constraint collision", async () => {
    let call = 0;
    const { supabase, insert } = fakeSupabase(() => {
      call += 1;
      if (call === 1) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      return { data: { id: "evt-2", join_code: "ZZZZZZ", title: "Soirée", status: "draft" }, error: null };
    });

    const { data, error } = await createDraftEvent(supabase, {
      title: "Soirée",
      language: "fr",
      venue_label: null,
    });

    expect(error).toBeNull();
    expect(data?.id).toBe("evt-2");
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("surfaces a non-collision error immediately without retrying", async () => {
    const { supabase, insert } = fakeSupabase(() => ({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }));

    const { data, error } = await createDraftEvent(supabase, {
      title: "Soirée",
      language: "fr",
      venue_label: null,
    });

    expect(data).toBeNull();
    expect(error?.message).toBe("permission denied");
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
