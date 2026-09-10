import { env, runInDurableObject, SELF } from "cloudflare:test";
import { getServerByName } from "partyserver";
import { describe, expect, it } from "vitest";

import type { EventRoom } from "../src/EventRoom";

/** Open a WebSocket to the worker for `room` and wait until it is connected. */
async function connect(room: string): Promise<WebSocket> {
  const res = await SELF.fetch(`https://example.com/parties/event-room/${room}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a WebSocket, got HTTP ${res.status}`);
  ws.accept();
  return ws;
}

/** Send `text` and resolve with the first message echoed back. */
function roundtrip(ws: WebSocket, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("message", (e) => resolve(String(e.data)), { once: true });
    ws.addEventListener("error", () => reject(new Error("socket error")), { once: true });
    ws.send(text);
  });
}

describe("EventRoom", () => {
  it("echoes each client's messages and shares one instance per event id", async () => {
    const a = await connect("E");
    const b = await connect("E");

    expect(await roundtrip(a, "from-a")).toBe("from-a");
    expect(await roundtrip(b, "from-b")).toBe("from-b");

    // Both connections landed on the same Durable Object instance for event "E".
    // (workerd has no jurisdiction support, so routing resolves unpinned here —
    // the EU pin is exercised on the real platform via /__diag/jurisdiction.)
    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, "E");
    await runInDurableObject(stub, (instance) => {
      expect([...instance.getConnections()].length).toBe(2);
    });

    a.close();
    b.close();
  });

  it("reports jurisdiction support status on the diagnostic route", async () => {
    const res = await SELF.fetch("https://example.com/__diag/jurisdiction");
    const body = (await res.json()) as { ok: boolean; error?: string };

    // Locally this is always `false` ("not implemented in workerd"); on the
    // deployed worker it answers Q-001 for the target plan.
    expect(typeof body.ok).toBe("boolean");
    if (!body.ok) expect(body.error).toMatch(/jurisdiction/i);
  });
});
