import { describe, expect, it } from "vitest";

import { withRetry } from "../src/retry";

describe("withRetry", () => {
  it("succeeds on the first attempt with no delay", async () => {
    let calls = 0;
    const ok = await withRetry(async () => {
      calls += 1;
    });
    expect(ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("retries after a transient failure and succeeds", async () => {
    let calls = 0;
    const ok = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("transient");
      },
      { delaysMs: [1] },
    );
    expect(ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("returns false once every attempt fails, without throwing", async () => {
    let calls = 0;
    const ok = await withRetry(
      async () => {
        calls += 1;
        throw new Error("persistent");
      },
      { delaysMs: [1, 1, 1] },
    );
    expect(ok).toBe(false);
    expect(calls).toBe(4); // 1 initial + 3 retries
  });

  it("waits the configured backoff between attempts", async () => {
    const delaysMs = [20, 40];
    let calls = 0;
    const start = Date.now();
    await withRetry(
      async () => {
        calls += 1;
        throw new Error("always fails");
      },
      { delaysMs },
    );
    const elapsed = Date.now() - start;
    expect(calls).toBe(3);
    expect(elapsed).toBeGreaterThanOrEqual(delaysMs[0]! + delaysMs[1]!);
  });
});
