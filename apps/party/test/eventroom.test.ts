// EventRoom connection-lifecycle tests (MILESTONE-05,
// openspec/changes/event-room-core). Real integration against the local
// Supabase stack (`supabase start`) — same convention as tools/db's suites:
// genuine signed-in users, no mocking of Auth/Postgres. See design.md for
// the decisions each block below proves.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateKeyPair, SignJWT } from "jose";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { getServerByName } from "partyserver";
import { afterAll, describe, expect, it } from "vitest";

import type { EventRoom } from "../src/EventRoom";

interface TestUser {
  profileId: string;
  email: string;
  accessToken: string;
}

const TEST_PASSWORD = "test-password-do-not-use-in-prod";

function adminClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Mirrors tools/db/src/testUsers.ts's pattern, self-contained here since
 * apps/party and tools/db share no workspace dependency. */
async function createSignedInUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${crypto.randomUUID()}@example.com`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`createUser(${email}) failed: ${createError?.message}`);

  const { data: signedIn, error: signInError } = await admin.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError || !signedIn.session) throw new Error(`signIn(${email}) failed: ${signInError?.message}`);

  return { profileId: created.user.id, email, accessToken: signedIn.session.access_token };
}

async function createAdmin(label: string): Promise<TestUser> {
  const user = await createSignedInUser(label);
  const admin = adminClient();
  const { error } = await admin.rpc("app_promote_admin", { target_email: user.email });
  if (error) throw new Error(`app_promote_admin failed for ${user.email}: ${error.message}`);
  return user;
}

/** Creates a real `event` row and a `participant` row for `user` on it, returning the event id. */
async function createEventWithParticipant(user: TestUser): Promise<string> {
  const admin = adminClient();
  const joinCode = `PT${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  const { data: event, error: eventError } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "Party Test Event", language: "en", status: "draft" })
    .select()
    .single();
  if (eventError || !event) throw new Error(`event insert failed: ${eventError?.message}`);

  const { error: participantError } = await admin
    .from("participant")
    .insert({ event_id: event.id, profile_id: user.profileId, display_name: "Party Tester" });
  if (participantError) throw new Error(`participant insert failed: ${participantError.message}`);

  return event.id as string;
}

/** A syntactically valid JWT, signed by a throwaway key unrelated to the project's JWKS. */
async function signBadToken(sub: string): Promise<string> {
  const { privateKey } = await generateKeyPair("ES256");
  return new SignJWT({ sub })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function connect(room: string, token?: string): Promise<WebSocket> {
  const url = new URL(`https://example.com/parties/event-room/${room}`);
  if (token) url.searchParams.set("token", token);
  const res = await SELF.fetch(url, { headers: { Upgrade: "websocket" } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a WebSocket, got HTTP ${res.status}`);
  ws.accept();
  return ws;
}

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("message", (e) => resolve(JSON.parse(String(e.data))), { once: true });
    ws.addEventListener(
      "close",
      (e) => reject(new Error(`socket closed before a message arrived: ${e.code} ${e.reason}`)),
      { once: true },
    );
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason }), { once: true });
  });
}

/** Resolves `"timeout"` if no message arrives within `ms` — used to assert silence. */
function waitForMessageOrTimeout(ws: WebSocket, ms = 200): Promise<Record<string, unknown> | "timeout"> {
  return Promise.race([
    new Promise<Record<string, unknown>>((resolve) => {
      ws.addEventListener("message", (e) => resolve(JSON.parse(String(e.data))), { once: true });
    }),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]);
}

const createdUserIds: string[] = [];
async function trackedAdmin(label: string): Promise<TestUser> {
  const user = await createAdmin(label);
  createdUserIds.push(user.profileId);
  return user;
}
async function trackedPlayer(label: string): Promise<TestUser> {
  const user = await createSignedInUser(label);
  createdUserIds.push(user.profileId);
  return user;
}

afterAll(async () => {
  const admin = adminClient();
  await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
});

describe("routing", () => {
  it("returns 404 for a request that doesn't match any party route", async () => {
    const res = await SELF.fetch("https://example.com/not-a-route");
    expect(res.status).toBe(404);
  });

  it("routes both connections for the same event id to the same Durable Object instance", async () => {
    const admin = await trackedAdmin("route-admin");
    const room = `route-${crypto.randomUUID()}`;

    const a = await connect(room, admin.accessToken);
    await waitForMessage(a);
    const b = await connect(room, admin.accessToken);
    await waitForMessage(b);

    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, room);
    await runInDurableObject(stub, (instance) => {
      expect([...instance.getConnections()].length).toBe(2);
    });

    a.close();
    b.close();
  });
});

describe("connection authentication", () => {
  it("rejects a connection with no token", async () => {
    const ws = await connect(`auth-no-token-${crypto.randomUUID()}`);
    const closed = await waitForClose(ws);
    expect(closed.code).toBe(4001);
  });

  it("rejects a connection with a token signed by a different key", async () => {
    const badToken = await signBadToken(crypto.randomUUID());
    const ws = await connect(`auth-bad-sig-${crypto.randomUUID()}`, badToken);
    const closed = await waitForClose(ws);
    expect(closed.code).toBe(4001);
  });

  it("accepts a connection with a validly-signed token and proceeds to role assignment", async () => {
    const admin = await trackedAdmin("auth-valid");
    const ws = await connect(`auth-valid-${crypto.randomUUID()}`, admin.accessToken);
    const snapshot = await waitForMessage(ws);
    expect(snapshot.type).toBe("state");
    ws.close();
  });
});

describe("role assignment", () => {
  it("assigns the admin role to an is_admin profile", async () => {
    const admin = await trackedAdmin("role-admin");
    const ws = await connect(`role-admin-room-${crypto.randomUUID()}`, admin.accessToken);
    const snapshot = await waitForMessage(ws);
    expect(snapshot.type).toBe("state");

    // Only an admin can claim control — proves the role landed as "admin".
    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const afterClaim = await waitForMessage(ws);
    expect(afterClaim.controllerId).toBe(admin.profileId);
    ws.close();
  });

  it("assigns the player role to a non-admin with a participant row for this event", async () => {
    const player = await trackedPlayer("role-player");
    const eventId = await createEventWithParticipant(player);

    const ws = await connect(eventId, player.accessToken);
    const snapshot = await waitForMessage(ws);
    expect(snapshot.type).toBe("state");

    // A player cannot claim control — proves the role landed as "player", not "admin".
    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const response = await waitForMessage(ws);
    expect(response.type).toBe("error");
    expect(response.code).toBe("forbidden");
    ws.close();
  });

  it("rejects a non-admin with no participant row for this event", async () => {
    const player = await trackedPlayer("role-no-participant");
    // This player has no participant anywhere yet — any event id rejects them.
    const ws = await connect(`role-no-participant-room-${crypto.randomUUID()}`, player.accessToken);
    const closed = await waitForClose(ws);
    expect(closed.code).toBe(4001);
  });
});

describe("state snapshot on connect", () => {
  it("sends a full snapshot with a server clock reference immediately on connect", async () => {
    const admin = await trackedAdmin("snapshot-admin");
    const before = Date.now();
    const ws = await connect(`snapshot-room-${crypto.randomUUID()}`, admin.accessToken);
    const snapshot = await waitForMessage(ws);

    expect(snapshot).toMatchObject({
      type: "state",
      eventStatus: "draft",
      step: null,
      display: "waiting",
      controllerId: null,
    });
    expect(typeof snapshot.serverNow).toBe("string");
    const serverNowMs = new Date(snapshot.serverNow as string).getTime();
    expect(serverNowMs).toBeGreaterThanOrEqual(before);
    ws.close();
  });

  it("a newly connecting client sees current state, not a stale default", async () => {
    const admin1 = await trackedAdmin("snapshot-mutator");
    const admin2 = await trackedAdmin("snapshot-observer");
    const room = `snapshot-live-${crypto.randomUUID()}`;

    const ws1 = await connect(room, admin1.accessToken);
    await waitForMessage(ws1); // initial snapshot
    ws1.send(JSON.stringify({ type: "mc:claim_control" }));
    await waitForMessage(ws1); // broadcast after the mutation
    ws1.close();

    const ws2 = await connect(room, admin2.accessToken);
    const snapshot = await waitForMessage(ws2);
    expect(snapshot.controllerId).toBe(admin1.profileId);
    ws2.close();
  });
});

describe("broadcast on change", () => {
  it("pushes a state change to every connected client", async () => {
    const admin1 = await trackedAdmin("broadcast-sender");
    const admin2 = await trackedAdmin("broadcast-listener");
    const room = `broadcast-room-${crypto.randomUUID()}`;

    const ws1 = await connect(room, admin1.accessToken);
    await waitForMessage(ws1);
    const ws2 = await connect(room, admin2.accessToken);
    await waitForMessage(ws2);

    ws1.send(JSON.stringify({ type: "mc:claim_control" }));

    const [update1, update2] = await Promise.all([waitForMessage(ws1), waitForMessage(ws2)]);
    expect(update1.controllerId).toBe(admin1.profileId);
    expect(update2.controllerId).toBe(admin1.profileId);

    ws1.close();
    ws2.close();
  });
});

describe("mc:claim_control", () => {
  it("rejects a non-admin's claim without changing state", async () => {
    const player = await trackedPlayer("claim-player");
    const eventId = await createEventWithParticipant(player);

    const ws = await connect(eventId, player.accessToken);
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });
    ws.close();
  });

  it("lets an admin claim control, transferring the lock", async () => {
    const admin = await trackedAdmin("claim-admin");
    const ws = await connect(`claim-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const update = await waitForMessage(ws);
    expect(update).toMatchObject({ type: "state", controllerId: admin.profileId });
    ws.close();
  });

  it("is idempotent — reclaiming control you already hold sends no additional broadcast", async () => {
    const admin = await trackedAdmin("claim-idempotent");
    const ws = await connect(`claim-idempotent-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    await waitForMessage(ws); // first claim: real change, one broadcast

    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const second = await waitForMessageOrTimeout(ws);
    expect(second).toBe("timeout");
    ws.close();
  });

  it("preserves control across a disconnect and reconnect under the same identity", async () => {
    const admin = await trackedAdmin("claim-reconnect");
    const room = `claim-reconnect-room-${crypto.randomUUID()}`;

    const ws1 = await connect(room, admin.accessToken);
    await waitForMessage(ws1);
    ws1.send(JSON.stringify({ type: "mc:claim_control" }));
    await waitForMessage(ws1);
    ws1.close();

    const ws2 = await connect(room, admin.accessToken);
    const snapshot = await waitForMessage(ws2);
    expect(snapshot.controllerId).toBe(admin.profileId);
    ws2.close();
  });

  it("returns an error for an unrecognized command type", async () => {
    const admin = await trackedAdmin("unknown-command");
    const ws = await connect(`unknown-command-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "not:a:real:command" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "unknown_command" });
    ws.close();
  });
});

// State survives Durable Object eviction — verified manually instead of by
// an automated test. `evictDurableObject()` (the built-in Cloudflare test
// helper for exactly this, from `cloudflare:test`) hangs indefinitely on
// this project's current toolchain (@cloudflare/vitest-pool-workers 0.22.0,
// the latest published version, which pins an alpha miniflare build) — a
// minimal repro with zero WebSocket connections reproduces the hang, so this
// is a toolchain limitation, not an issue in EventRoom's own persistence
// logic. That logic (`loadState`/`persistState` via `this.sql`) is exercised
// indirectly by every test above — every connect reads it, every
// `mc:claim_control` writes it — and was additionally confirmed manually:
// `wrangler dev` running locally, claimed control via a WebSocket client,
// restarted the dev server (a real process restart, a stronger reset than
// in-memory eviction), reconnected, and the snapshot still showed the
// claimed `controllerId`. See openspec/changes/event-room-core/tasks.md
// task 5.4 for this note recorded against the task itself.
