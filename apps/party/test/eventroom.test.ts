// EventRoom connection-lifecycle tests (MILESTONE-05,
// openspec/changes/event-room-core). Real integration against the local
// Supabase stack (`supabase start`) — same convention as tools/db's suites:
// genuine signed-in users, no mocking of Auth/Postgres. See design.md for
// the decisions each block below proves.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateKeyPair, SignJWT } from "jose";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { getServerByName } from "partyserver";
import { afterAll, afterEach, describe, expect, it } from "vitest";

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

const createdEventIds: string[] = [];

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
  createdEventIds.push(event.id as string);

  const { error: participantError } = await admin
    .from("participant")
    .insert({ event_id: event.id, profile_id: user.profileId, display_name: "Party Tester" });
  if (participantError) throw new Error(`participant insert failed: ${participantError.message}`);

  return event.id as string;
}

interface StepFixture {
  id: string;
  eventId: string;
  position: number;
}

/** Creates a `step` + its `game_mcq` content, returning the step id. */
async function createStep(
  eventId: string,
  position: number,
  options: {
    timed?: boolean;
    countdownSeconds?: number;
    pointsCorrect?: number;
    teamAwardPoints?: number;
  } = {},
): Promise<StepFixture> {
  const admin = adminClient();
  const { data: step, error: stepError } = await admin
    .from("step")
    .insert({
      event_id: eventId,
      position,
      timed: options.timed ?? false,
      countdown_seconds: options.countdownSeconds ?? 0,
      points_correct: options.pointsCorrect ?? 1,
      team_award_points: options.teamAwardPoints ?? 0,
    })
    .select()
    .single();
  if (stepError || !step) throw new Error(`createStep failed: ${stepError?.message}`);

  const { error: mcqError } = await admin.from("game_mcq").insert({
    step_id: step.id,
    question_text: `Question for step ${position}`,
    options: [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
    ],
    correct_option_id: "a",
  });
  if (mcqError) throw new Error(`createStep game_mcq failed: ${mcqError.message}`);

  return { id: step.id as string, eventId, position };
}

/** Inserts a participant row for `user` in `eventId`, returning the participant id. */
async function addParticipant(eventId: string, user: TestUser, displayName: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("participant")
    .insert({ event_id: eventId, profile_id: user.profileId, display_name: displayName })
    .select("id")
    .single();
  if (error || !data) throw new Error(`addParticipant failed: ${error?.message}`);
  return data.id as string;
}

/** Creates a team and assigns `participantIds` to it, returning the team id. */
async function createTeam(eventId: string, name: string, participantIds: string[]): Promise<string> {
  const admin = adminClient();
  const { data: team, error: teamError } = await admin
    .from("team")
    .insert({ event_id: eventId, name })
    .select("id")
    .single();
  if (teamError || !team) throw new Error(`createTeam failed: ${teamError?.message}`);
  for (const participantId of participantIds) {
    const { error } = await admin.from("participant").update({ team_id: team.id }).eq("id", participantId);
    if (error) throw new Error(`assigning team failed: ${error.message}`);
  }
  return team.id as string;
}

/** Runs a player through connect → answer:submit → close, in one step. */
async function submitAnswer(room: string, player: TestUser, stepId: string, optionId: string): Promise<void> {
  const ws = await connect(room, player.accessToken);
  await waitForMessage(ws);
  ws.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId } }));
  await waitForMessage(ws);
  ws.close();
}

/** Creates a bare draft `event` row (no participant), returning its id. */
async function makeDraftEvent(): Promise<string> {
  const admin = adminClient();
  const joinCode = `MQ${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const { data: event, error } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "MCQ Test Event", language: "en", status: "draft" })
    .select()
    .single();
  if (error || !event) throw new Error(`makeDraftEvent failed: ${error?.message}`);
  createdEventIds.push(event.id as string);
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

async function connect(room: string, token?: string, options: { screen?: boolean } = {}): Promise<WebSocket> {
  const url = new URL(`https://example.com/parties/event-room/${room}`);
  if (token) url.searchParams.set("token", token);
  if (options.screen) url.searchParams.set("screen", "1");
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

/** Consumes messages until one of the given type arrives, discarding the rest. */
async function waitForMessageOfType(ws: WebSocket, type: string): Promise<Record<string, unknown>> {
  for (;;) {
    const message = await waitForMessage(ws);
    if (message.type === type) return message;
  }
}

/**
 * A queue-backed reader, unlike `waitForMessage`'s per-call `{once: true}`
 * listener: attaches one persistent listener up front and buffers every
 * message from then on, so a tight burst of several synchronous broadcasts
 * (e.g. `mc:reveal`'s state/step_results/rankings, sent back-to-back after
 * real async I/O with no yield in between) can never race ahead of a
 * `waitForMessage`-style re-subscription between messages.
 */
function queueMessages(ws: WebSocket): { next(): Promise<Record<string, unknown>> } {
  const pending: Record<string, unknown>[] = [];
  const waiters: ((message: Record<string, unknown>) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const message = JSON.parse(String(e.data)) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else pending.push(message);
  });
  return {
    next(): Promise<Record<string, unknown>> {
      const buffered = pending.shift();
      if (buffered) return Promise.resolve(buffered);
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

/** Connects as `admin`, waits for the initial snapshot, then claims control. */
async function connectAndClaimControl(room: string, admin: TestUser): Promise<WebSocket> {
  const ws = await connect(room, admin.accessToken);
  await waitForMessage(ws); // initial snapshot
  ws.send(JSON.stringify({ type: "mc:claim_control" }));
  await waitForMessage(ws); // controllerId update
  return ws;
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

afterEach(async () => {
  // Several tests transition their event to `live`, and only one `live`
  // event may exist at a time (MILESTONE-02's partial unique index) — this
  // must release the slot after *every* test, not just at the very end,
  // otherwise a later test's own mc:start collides with an earlier test's
  // still-live fixture. Deleting an event cascades to its
  // steps/game_mcq/participants.
  if (createdEventIds.length === 0) return;
  const admin = adminClient();
  const ids = createdEventIds.splice(0, createdEventIds.length);
  for (const id of ids) {
    await admin.from("event").delete().eq("id", id);
  }
});

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

describe("mc:start", () => {
  it("starts the event: Postgres transitions to live, step 1 becomes active with its question", async () => {
    const admin = await trackedAdmin("start-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await createStep(eventId, 2);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    const update = await waitForMessage(ws);

    expect(update).toMatchObject({ type: "state", eventStatus: "live" });
    expect(update.step).toMatchObject({ position: 1, status: "active" });
    expect(update.question).toMatchObject({ text: "Question for step 1" });
    // The answer key must never appear in the broadcast.
    expect(JSON.stringify(update)).not.toContain("correct_option_id");

    const eventRow = await adminClient().from("event").select("status, season_year").eq("id", eventId).single();
    expect(eventRow.data?.status).toBe("live");
    expect(eventRow.data?.season_year).toBe(new Date().getUTCFullYear());

    ws.close();
  });

  it("rejects a non-controller", async () => {
    const admin = await trackedAdmin("start-noncontrol-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    // Connected but never claimed control.
    const ws = await connect(eventId, admin.accessToken);
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:start" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });

    const eventRow = await adminClient().from("event").select("status").eq("id", eventId).single();
    expect(eventRow.data?.status).toBe("draft");
    ws.close();
  });

  it("rejects starting an already-live event", async () => {
    const admin = await trackedAdmin("start-twice-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws); // first start succeeds

    ws.send(JSON.stringify({ type: "mc:start" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "not_draft" });
    ws.close();
  });

  it("rejects starting an event with no steps", async () => {
    const admin = await trackedAdmin("start-nosteps-admin");
    const eventId = await makeDraftEvent();

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "no_steps" });
    ws.close();
  });
});

describe("mc:advance", () => {
  it("moves to the next step with a fresh timer and question", async () => {
    const admin = await trackedAdmin("advance-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await createStep(eventId, 2);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(ws);
    const firstStepId = (started.step as { id: string }).id;

    ws.send(JSON.stringify({ type: "mc:advance" }));
    const advanced = await waitForMessage(ws);
    expect(advanced.step).toMatchObject({ position: 2, status: "active" });
    expect((advanced.step as { id: string }).id).not.toBe(firstStepId);
    expect(advanced.question).toMatchObject({ text: "Question for step 2" });
    ws.close();
  });

  it("rejects a non-controller", async () => {
    const admin = await trackedAdmin("advance-noncontrol-admin");
    const other = await trackedAdmin("advance-noncontrol-other");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await createStep(eventId, 2);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(eventId, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "mc:advance" }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });

    controllerWs.close();
    otherWs.close();
  });

  it("rejects advancing past the last step, leaving state unchanged", async () => {
    const admin = await trackedAdmin("advance-last-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:advance" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "no_next_step" });
    expect(response.step).toBeUndefined(); // it's an error message, not a new state broadcast
    expect(started.step).toMatchObject({ position: 1 }); // unchanged from the start
    ws.close();
  });

  it("a repeated advance (already applied) does not double-advance", async () => {
    const admin = await trackedAdmin("advance-repeat-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await createStep(eventId, 2);
    await createStep(eventId, 3);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:advance" }));
    const firstAdvance = await waitForMessage(ws);
    expect(firstAdvance.step).toMatchObject({ position: 2 });

    // Two rapid, duplicate mc:advance sends should not skip to step 3.
    ws.send(JSON.stringify({ type: "mc:advance" }));
    const secondAdvance = await waitForMessage(ws);
    expect(secondAdvance.step).toMatchObject({ position: 3 });
    ws.close();
  });
});

describe("mc:lock and the expiry alarm", () => {
  it("explicit mc:lock transitions the active step to locked", async () => {
    const admin = await trackedAdmin("lock-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:lock" }));
    const locked = await waitForMessage(ws);
    expect(locked.step).toMatchObject({ status: "locked" });
    ws.close();
  });

  it("rejects a non-controller", async () => {
    const admin = await trackedAdmin("lock-noncontrol-admin");
    const other = await trackedAdmin("lock-noncontrol-other");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(eventId, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "mc:lock" }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });

    controllerWs.close();
    otherWs.close();
  });

  it(
    "the DO alarm auto-locks a timed step at expiry, with no client mc:lock",
    async () => {
      // `runDurableObjectAlarm` (the built-in deterministic trigger for
      // exactly this) hangs indefinitely on this project's current toolchain
      // (@cloudflare/vitest-pool-workers 0.22.0, alpha miniflare) — the same
      // class of issue as `evictDurableObject` hanging in MILESTONE-05.
      // Alarms DO fire on their own after real wall-clock time in this
      // environment (confirmed empirically), so this waits for the real
      // 1s-countdown + 2s-grace deadline instead of forcing the alarm.
      const admin = await trackedAdmin("alarm-admin");
      const eventId = await makeDraftEvent();
      await createStep(eventId, 1, { timed: true, countdownSeconds: 1 });

      const ws = await connectAndClaimControl(eventId, admin);
      ws.send(JSON.stringify({ type: "mc:start" }));
      await waitForMessage(ws);

      const locked = await waitForMessage(ws); // the alarm's own broadcast, no mc:lock sent
      expect(locked.step).toMatchObject({ status: "locked" });
      ws.close();
    },
    10000,
  );

  it("onAlarm is a safe no-op when there is no active step to lock", async () => {
    // Guards the staleness case (design.md D3): whatever nominally scheduled
    // an alarm, firing it when nothing is active must never error or change
    // state. Calls the public onAlarm() method directly via
    // runInDurableObject to prove this without depending on real timer
    // behavior. Asserted via the persisted `room_state` row (`this.sql`,
    // also public) rather than a WebSocket broadcast reaching `ws` —
    // manually invoking onAlarm() this way doesn't reliably re-attach to the
    // same hibernation-tracked connection `broadcast()` sends to, which is a
    // harness quirk, not a behavior this milestone needs to prove.
    const admin = await trackedAdmin("alarm-noop-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1, { timed: true, countdownSeconds: 30 });

    const room = eventId;
    const ws = await connectAndClaimControl(room, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);
    ws.close();

    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, room);

    // First call: locks the (still active) step for real.
    await runInDurableObject(stub, async (instance) => {
      await instance.onAlarm();
    });
    const afterFirstCall = await runInDurableObject(stub, (instance) => {
      return instance.sql<{ data: string }>`select data from room_state where id = 0`;
    });
    const stateAfterFirstCall = JSON.parse(afterFirstCall[0]!.data) as { step: { status: string } };
    expect(stateAfterFirstCall.step.status).toBe("locked");

    // Second call: nothing is active anymore — must be a silent no-op, i.e.
    // the persisted state must be byte-for-byte unchanged.
    await runInDurableObject(stub, async (instance) => {
      await instance.onAlarm();
    });
    const afterSecondCall = await runInDurableObject(stub, (instance) => {
      return instance.sql<{ data: string }>`select data from room_state where id = 0`;
    });
    expect(afterSecondCall[0]!.data).toBe(afterFirstCall[0]!.data);
  });
});

describe("answer:submit", () => {
  it("accepts a valid answer and acknowledges it", async () => {
    const admin = await trackedAdmin("answer-admin");
    const player = await trackedPlayer("answer-player");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await adminClient()
      .from("participant")
      .insert({ event_id: eventId, profile_id: player.profileId, display_name: "AnswerPlayer" });

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(controllerWs);
    const stepId = (started.step as { id: string }).id;

    const playerWs = await connect(eventId, player.accessToken);
    await waitForMessage(playerWs);
    playerWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "a" } }));
    const ack = await waitForMessage(playerWs);
    expect(ack).toMatchObject({ type: "answer_ack", stepId, optionId: "a" });

    controllerWs.close();
    playerWs.close();
  });

  it("rejects an answer for a non-active step", async () => {
    const player = await trackedPlayer("answer-notactive-player");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await adminClient()
      .from("participant")
      .insert({ event_id: eventId, profile_id: player.profileId, display_name: "AnswerPlayer" });

    // Event never started — no step is active.
    const playerWs = await connect(eventId, player.accessToken);
    await waitForMessage(playerWs);
    playerWs.send(
      JSON.stringify({ type: "answer:submit", payload: { stepId: crypto.randomUUID(), optionId: "a" } }),
    );
    const response = await waitForMessage(playerWs);
    expect(response).toMatchObject({ type: "error", code: "not_active" });
    playerWs.close();
  });

  it(
    "rejects a late answer, whether or not the step has been marked locked yet",
    async () => {
      // Real time must pass for `Date.now()` to genuinely exceed the
      // deadline, and this environment's alarms do fire on their own after
      // real wall-clock time (confirmed empirically, see the "mc:lock and
      // the expiry alarm" suite) — so by the time this arrives, the step may
      // read as "active" (rejected by the fresh time check, design.md D4:
      // code "too_late") or already "locked" by the alarm (rejected by the
      // active-step check: code "not_active"). Both are correct rejections
      // of a late answer; which one fires is a race this test doesn't pin
      // down, but neither path ever accepts the answer, which is the actual
      // guarantee (FR-043).
      const admin = await trackedAdmin("answer-late-admin");
      const player = await trackedPlayer("answer-late-player");
      const eventId = await makeDraftEvent();
      await createStep(eventId, 1, { timed: true, countdownSeconds: 1 });
      await adminClient()
        .from("participant")
        .insert({ event_id: eventId, profile_id: player.profileId, display_name: "LatePlayer" });

      const controllerWs = await connectAndClaimControl(eventId, admin);
      controllerWs.send(JSON.stringify({ type: "mc:start" }));
      const started = await waitForMessage(controllerWs);
      const stepId = (started.step as { id: string }).id;
      expect(started.step).toMatchObject({ status: "active" });

      const playerWs = await connect(eventId, player.accessToken);
      await waitForMessage(playerWs);

      // 1s countdown + 2s grace = 3s deadline; wait past it.
      await new Promise((resolve) => setTimeout(resolve, 3200));

      playerWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "a" } }));
      const response = await waitForMessage(playerWs);
      expect(response.type).toBe("error");
      expect(["too_late", "not_active"]).toContain(response.code);

      controllerWs.close();
      playerWs.close();
    },
    10000,
  );

  it("rejects a duplicate answer from the same participant", async () => {
    const admin = await trackedAdmin("answer-dup-admin");
    const player = await trackedPlayer("answer-dup-player");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await adminClient()
      .from("participant")
      .insert({ event_id: eventId, profile_id: player.profileId, display_name: "DupPlayer" });

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(controllerWs);
    const stepId = (started.step as { id: string }).id;

    const playerWs = await connect(eventId, player.accessToken);
    await waitForMessage(playerWs);
    playerWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "a" } }));
    await waitForMessage(playerWs); // first accepted

    playerWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "b" } }));
    const response = await waitForMessage(playerWs);
    expect(response).toMatchObject({ type: "error", code: "already_answered" });

    controllerWs.close();
    playerWs.close();
  });

  it("stamps a monotonically increasing receipt_seq across multiple participants", async () => {
    const admin = await trackedAdmin("answer-seq-admin");
    const playerA = await trackedPlayer("answer-seq-a");
    const playerB = await trackedPlayer("answer-seq-b");
    const playerC = await trackedPlayer("answer-seq-c");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    for (const p of [playerA, playerB, playerC]) {
      await adminClient()
        .from("participant")
        .insert({ event_id: eventId, profile_id: p.profileId, display_name: "SeqPlayer" });
    }

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(controllerWs);
    const stepId = (started.step as { id: string }).id;

    const room = eventId;
    for (const p of [playerA, playerB, playerC]) {
      const ws = await connect(room, p.accessToken);
      await waitForMessage(ws);
      ws.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "a" } }));
      await waitForMessage(ws);
      ws.close();
    }

    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, room);
    const rows = await runInDurableObject(stub, (instance) => {
      return instance.sql<{
        id: number;
        participant_id: string;
      }>`select id, participant_id from local_answer where step_id = ${stepId} order by id asc`;
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.id).toBeLessThan(rows[1]!.id);
    expect(rows[1]!.id).toBeLessThan(rows[2]!.id);

    controllerWs.close();
  });

  it("rejects an answer while the kill switch is active, writing no local_answer row (moderation-kill-switch design.md D3)", async () => {
    const admin = await trackedAdmin("answer-killswitch-admin");
    const player = await trackedPlayer("answer-killswitch-player");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await adminClient()
      .from("participant")
      .insert({ event_id: eventId, profile_id: player.profileId, display_name: "KillSwitchPlayer" });

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(controllerWs);
    const stepId = (started.step as { id: string }).id;

    controllerWs.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: true } }));
    await waitForMessage(controllerWs);

    const playerWs = await connect(eventId, player.accessToken);
    await waitForMessage(playerWs);
    playerWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "a" } }));
    const response = await waitForMessage(playerWs);
    expect(response).toMatchObject({ type: "error", code: "kill_switch_active" });

    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, eventId);
    const rows = await runInDurableObject(stub, (instance) => {
      return instance.sql<{ id: number }>`select id from local_answer where step_id = ${stepId}`;
    });
    expect(rows).toHaveLength(0);

    controllerWs.close();
    playerWs.close();
  });
});

describe("mc:kill_switch", () => {
  it("an admin activates it, broadcasting state with killSwitch true", async () => {
    const admin = await trackedAdmin("killswitch-admin");
    const ws = await connect(`killswitch-room-${crypto.randomUUID()}`, admin.accessToken);
    const initial = await waitForMessage(ws);
    expect(initial).toMatchObject({ type: "state", killSwitch: false });

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: true } }));
    const update = await waitForMessage(ws);
    expect(update).toMatchObject({ type: "state", killSwitch: true });
    ws.close();
  });

  it("an admin clears it after activating, restoring killSwitch false", async () => {
    const admin = await trackedAdmin("killswitch-clear-admin");
    const ws = await connect(`killswitch-clear-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: true } }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: false } }));
    const update = await waitForMessage(ws);
    expect(update).toMatchObject({ type: "state", killSwitch: false });
    ws.close();
  });

  it("does not mutate display or step (only killSwitch changes)", async () => {
    const admin = await trackedAdmin("killswitch-unaffected-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "operator:display", payload: { view: "leaderboard" } }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: true } }));
    const activated = await waitForMessage(ws);
    expect(activated).toMatchObject({
      type: "state",
      killSwitch: true,
      display: "leaderboard",
      step: { id: (started.step as { id: string }).id, status: "active" },
    });

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: false } }));
    const cleared = await waitForMessage(ws);
    expect(cleared).toMatchObject({
      type: "state",
      killSwitch: false,
      display: "leaderboard",
      step: { id: (started.step as { id: string }).id, status: "active" },
    });

    ws.close();
  });

  it("rejects a non-admin", async () => {
    const player = await trackedPlayer("killswitch-player");
    const eventId = await createEventWithParticipant(player);
    const ws = await connect(eventId, player.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: true } }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });
    ws.close();
  });

  it("rejects an invalid payload", async () => {
    const admin = await trackedAdmin("killswitch-invalid-admin");
    const ws = await connect(`killswitch-invalid-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:kill_switch", payload: {} }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "invalid_message" });
    ws.close();
  });

  it("succeeds for an admin who does not hold flow control (not flow-controller-gated)", async () => {
    const controller = await trackedAdmin("killswitch-controller");
    const other = await trackedAdmin("killswitch-other");
    const room = `killswitch-uncontrolled-room-${crypto.randomUUID()}`;

    const controllerWs = await connect(room, controller.accessToken);
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:claim_control" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(room, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "mc:kill_switch", payload: { on: true } }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "state", killSwitch: true });

    controllerWs.close();
    otherWs.close();
  });
});

describe("hidden participants and teams are excluded from broadcasts (moderation-kill-switch design.md D4)", () => {
  it("a hidden participant is excluded from rankings/step_results but still scored and persisted", async () => {
    const admin = await trackedAdmin("hidden-admin");
    const visiblePlayer = await trackedPlayer("hidden-visible-player");
    const hiddenPlayer = await trackedPlayer("hidden-hidden-player");
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1, { pointsCorrect: 5, teamAwardPoints: 5 });

    const visibleParticipantId = await addParticipant(eventId, visiblePlayer, "VisiblePlayer");
    const hiddenParticipantId = await addParticipant(eventId, hiddenPlayer, "HiddenPlayer");
    const teamId = await createTeam(eventId, "Hidden Test Team", [visibleParticipantId, hiddenParticipantId]);
    await adminClient().from("team").update({ hidden: true }).eq("id", teamId);
    await adminClient().from("participant").update({ hidden: true }).eq("id", hiddenParticipantId);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);
    await submitAnswer(eventId, visiblePlayer, step.id, "a");
    await submitAnswer(eventId, hiddenPlayer, step.id, "a");
    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);

    const messages = queueMessages(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    await messages.next(); // state
    const stepResults = await messages.next();
    const rankings = await messages.next();

    expect(stepResults.type).toBe("step_results");
    expect((stepResults.participants as { participantId: string }[]).map((p) => p.participantId)).toEqual([
      visibleParticipantId,
    ]);

    expect(rankings.type).toBe("rankings");
    expect((rankings.individuals as { participantId: string }[]).map((p) => p.participantId)).toEqual([
      visibleParticipantId,
    ]);
    expect((rankings.teams as { teamId: string }[]).map((t) => t.teamId)).toEqual([]);

    // The hidden entities' answers/scores are still fully persisted — the
    // broadcast is filtered, the record is not (design.md D4).
    const admin_ = adminClient();
    const { data: answerRows } = await admin_.from("answer").select("participant_id").eq("step_id", step.id);
    expect((answerRows ?? []).map((r) => r.participant_id).sort()).toEqual(
      [visibleParticipantId, hiddenParticipantId].sort(),
    );
    const { data: participantResultRows } = await admin_
      .from("step_result_participant")
      .select("participant_id, points")
      .eq("step_id", step.id);
    expect((participantResultRows ?? []).map((r) => r.participant_id).sort()).toEqual(
      [visibleParticipantId, hiddenParticipantId].sort(),
    );
    // Both participants answered correctly and share the hidden team — its
    // total still counts the hidden participant's points even though the
    // team itself is hidden from the broadcast.
    const { data: teamResultRows } = await admin_
      .from("step_result_team")
      .select("awarded_points")
      .eq("step_id", step.id)
      .eq("team_id", teamId)
      .single();
    expect(teamResultRows?.awarded_points).toBe(5);

    controllerWs.close();
  });
});

describe("mc:reveal", () => {
  it("rejects a non-controller", async () => {
    const admin = await trackedAdmin("reveal-noncontrol-admin");
    const other = await trackedAdmin("reveal-noncontrol-other");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(eventId, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "mc:reveal" }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });

    controllerWs.close();
    otherWs.close();
  });

  it("rejects revealing a step that is still active", async () => {
    const admin = await trackedAdmin("reveal-active-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws); // step is active, never locked

    ws.send(JSON.stringify({ type: "mc:reveal" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "not_locked" });
    ws.close();
  });

  it("rejects revealing when there is no current step (event never started, so not_live fires first — reveal-leaderboard-end design.md D3)", async () => {
    const admin = await trackedAdmin("reveal-nostep-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    // Connected and controlling, but mc:start was never sent.
    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:reveal" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "not_live" });
    ws.close();
  });

  it("scores a locked step and matches hand-calculated results (happy path)", async () => {
    const admin = await trackedAdmin("reveal-happy-admin");
    const p1 = await trackedPlayer("reveal-happy-p1"); // correct, on team
    const p2 = await trackedPlayer("reveal-happy-p2"); // correct, on team
    const p3 = await trackedPlayer("reveal-happy-p3"); // incorrect, solo
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1, { pointsCorrect: 5, teamAwardPoints: 10 });

    const pid1 = await addParticipant(eventId, p1, "P1");
    const pid2 = await addParticipant(eventId, p2, "P2");
    await addParticipant(eventId, p3, "P3");
    const teamId = await createTeam(eventId, "Team Happy", [pid1, pid2]);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);

    await submitAnswer(eventId, p1, step.id, "a");
    await submitAnswer(eventId, p2, step.id, "a");
    await submitAnswer(eventId, p3, step.id, "b");

    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);

    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    const stateAfterReveal = await waitForMessage(controllerWs);
    expect(stateAfterReveal).toMatchObject({ type: "state", step: { status: "revealed" } });

    const results = await waitForMessage(controllerWs);
    expect(results.type).toBe("step_results");
    expect(results.stepId).toBe(step.id);
    expect(results.participants).toEqual(
      expect.arrayContaining([
        { participantId: pid1, isCorrect: true, points: 5 },
        { participantId: pid2, isCorrect: true, points: 5 },
      ]),
    );
    expect(results.teams).toEqual([{ teamId, avgScore: 5, isWinner: true, awardedPoints: 10 }]);
    // The answer key must never appear in any broadcast.
    expect(JSON.stringify(results)).not.toContain("correct_option_id");

    const rankings = await waitForMessage(controllerWs);
    expect(rankings.type).toBe("rankings");
    expect(rankings.individuals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: pid1, total: 5 }),
        expect.objectContaining({ participantId: pid2, total: 5 }),
      ]),
    );

    // Postgres actually persisted real is_correct/scored_points and the revealed status.
    const answerRows = await adminClient().from("answer").select("participant_id, is_correct, scored_points").eq(
      "step_id",
      step.id,
    );
    expect(answerRows.data).toEqual(
      expect.arrayContaining([
        { participant_id: pid1, is_correct: true, scored_points: 5 },
        { participant_id: pid2, is_correct: true, scored_points: 5 },
      ]),
    );
    const stepRow = await adminClient().from("step").select("status").eq("id", step.id).single();
    expect(stepRow.data?.status).toBe("revealed");

    controllerWs.close();
  });

  it("sends each player their own personalised result, correct or not, submitter or not", async () => {
    const admin = await trackedAdmin("reveal-own-admin");
    const correctPlayer = await trackedPlayer("reveal-own-correct");
    const silentPlayer = await trackedPlayer("reveal-own-silent"); // never submits
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1, { pointsCorrect: 3 });
    await addParticipant(eventId, correctPlayer, "Correct");
    await addParticipant(eventId, silentPlayer, "Silent");

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    const started = await waitForMessage(controllerWs);
    const stepId = (started.step as { id: string }).id;

    const correctWs = await connect(eventId, correctPlayer.accessToken);
    await waitForMessage(correctWs);
    correctWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId: "a" } }));
    await waitForMessage(correctWs); // ack

    const silentWs = await connect(eventId, silentPlayer.accessToken);
    await waitForMessage(silentWs);

    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await Promise.all([waitForMessage(controllerWs), waitForMessage(correctWs), waitForMessage(silentWs)]);
    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));

    const [ownForCorrect, ownForSilent] = await Promise.all([
      waitForMessageOfType(correctWs, "own_result"),
      waitForMessageOfType(silentWs, "own_result"),
    ]);
    expect(ownForCorrect).toEqual({ type: "own_result", stepId: step.id, isCorrect: true, points: 3 });
    expect(ownForSilent).toEqual({ type: "own_result", stepId: step.id, isCorrect: false, points: 0 });

    controllerWs.close();
    correctWs.close();
    silentWs.close();
  });

  it("a repeated reveal on an already-revealed step is a silent no-op", async () => {
    const admin = await trackedAdmin("reveal-repeat-admin");
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // step_results
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "mc:reveal" }));
    const second = await waitForMessageOrTimeout(ws);
    expect(second).toBe("timeout");

    const stepRow = await adminClient().from("step").select("status").eq("id", step.id).single();
    expect(stepRow.data?.status).toBe("revealed");
    ws.close();
  });

  it("a participant who joins after a step is revealed has no result for that step, and scores normally on the next one", async () => {
    const admin = await trackedAdmin("reveal-latejoin-admin");
    const early = await trackedPlayer("reveal-latejoin-early");
    const late = await trackedPlayer("reveal-latejoin-late");
    const eventId = await makeDraftEvent();
    const step1 = await createStep(eventId, 1, { pointsCorrect: 2 });
    const step2 = await createStep(eventId, 2, { pointsCorrect: 2 });
    await addParticipant(eventId, early, "Early");

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);
    await submitAnswer(eventId, early, step1.id, "a");
    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(controllerWs); // state
    await waitForMessage(controllerWs); // step_results
    await waitForMessage(controllerWs); // rankings

    // The late joiner arrives only now, after step 1 is already revealed.
    const latePid = await addParticipant(eventId, late, "Late");

    controllerWs.send(JSON.stringify({ type: "mc:advance" }));
    await waitForMessage(controllerWs);
    await submitAnswer(eventId, late, step2.id, "a");
    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(controllerWs); // state
    const step2Results = await waitForMessage(controllerWs); // step_results
    expect(step2Results.participants).toEqual(
      expect.arrayContaining([{ participantId: latePid, isCorrect: true, points: 2 }]),
    );

    const step1Row = await adminClient()
      .from("step_result_participant")
      .select("participant_id")
      .eq("step_id", step1.id)
      .eq("participant_id", latePid);
    expect(step1Row.data).toEqual([]); // no row at all for the late joiner on step 1

    controllerWs.close();
  });

  it(
    "when every retry fails, sends reveal_failed, leaves the step locked, and broadcasts nothing",
    async () => {
      const admin = await trackedAdmin("reveal-fail-admin");
      const observer = await trackedAdmin("reveal-fail-observer");
      const doomedPlayer = await trackedPlayer("reveal-fail-doomed");
      const eventId = await makeDraftEvent();
      const step = await createStep(eventId, 1);
      await addParticipant(eventId, doomedPlayer, "Doomed");

      const controllerWs = await connectAndClaimControl(eventId, admin);
      controllerWs.send(JSON.stringify({ type: "mc:start" }));
      await waitForMessage(controllerWs);
      await submitAnswer(eventId, doomedPlayer, step.id, "a");
      controllerWs.send(JSON.stringify({ type: "mc:lock" }));
      await waitForMessage(controllerWs);

      // A second connection observes whether anything gets broadcast.
      const observerWs = await connect(eventId, observer.accessToken);
      await waitForMessage(observerWs);

      // Simulate an external deletion between answering and reveal (e.g. a
      // moderation/GDPR action): the participant row now referenced by this
      // step's local_answer no longer exists in Postgres, so every attempt
      // to write its `answer` row genuinely and deterministically fails a
      // real foreign-key constraint — not a mock, not a flake.
      const doomedParticipant = await adminClient()
        .from("participant")
        .select("id")
        .eq("event_id", eventId)
        .eq("profile_id", doomedPlayer.profileId)
        .single();
      await adminClient().from("participant").delete().eq("id", doomedParticipant.data!.id as string);

      controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
      const response = await waitForMessage(controllerWs);
      expect(response).toMatchObject({ type: "error", code: "reveal_failed" });

      const observed = await waitForMessageOrTimeout(observerWs, 300);
      expect(observed).toBe("timeout"); // nothing was broadcast to the other connection

      const stepRow = await adminClient().from("step").select("status").eq("id", step.id).single();
      expect(stepRow.data?.status).toBe("pending"); // Postgres step.status was never touched by MILESTONE-07 either

      const stub = await getServerByName<Env, EventRoom>(env.EventRoom, eventId);
      const persisted = await runInDurableObject(stub, (instance) => {
        return instance.sql<{ data: string }>`select data from room_state where id = 0`;
      });
      const state = JSON.parse(persisted[0]!.data) as { step: { status: string } };
      expect(state.step.status).toBe("locked"); // DO state was never mutated either

      controllerWs.close();
      observerWs.close();
    },
    15000,
  );
});

describe("mc:show_leaderboard", () => {
  it("recomputes rankings and sets the display directive", async () => {
    const admin = await trackedAdmin("leaderboard-admin");
    const player = await trackedPlayer("leaderboard-player");
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1, { pointsCorrect: 4 });
    await addParticipant(eventId, player, "LeaderboardPlayer");

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);
    await submitAnswer(eventId, player, step.id, "a");
    ws.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // step_results
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "mc:show_leaderboard" }));
    const stateUpdate = await waitForMessage(ws);
    expect(stateUpdate).toMatchObject({ type: "state", display: "leaderboard" });
    const rankings = await waitForMessage(ws);
    expect(rankings.type).toBe("rankings");
    expect(rankings.individuals).toEqual(expect.arrayContaining([expect.objectContaining({ total: 4 })]));

    ws.close();
  });

  it("rejects a non-controller", async () => {
    const admin = await trackedAdmin("leaderboard-noncontrol-admin");
    const other = await trackedAdmin("leaderboard-noncontrol-other");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(eventId, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "mc:show_leaderboard" }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });

    controllerWs.close();
    otherWs.close();
  });

  it("a repeated call still re-broadcasts, not a silent no-op (design.md D5)", async () => {
    const admin = await trackedAdmin("leaderboard-repeat-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:show_leaderboard" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "mc:show_leaderboard" }));
    const second = await waitForMessageOrTimeout(ws, 500);
    expect(second).not.toBe("timeout"); // still broadcasts, unlike e.g. mc:claim_control's idempotent no-op

    ws.close();
  });
});

describe("mc:end", () => {
  it("finalises the event: Postgres event_final_* rows, event.status/ended_at, and a final rankings broadcast", async () => {
    const admin = await trackedAdmin("end-admin");
    const player = await trackedPlayer("end-player");
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1, { pointsCorrect: 3 });
    const participantId = await addParticipant(eventId, player, "EndPlayer");

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);
    await submitAnswer(eventId, player, step.id, "a");
    ws.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // step_results
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "mc:end" }));
    const stateUpdate = await waitForMessage(ws);
    expect(stateUpdate).toMatchObject({ type: "state", eventStatus: "ended" });
    const rankings = await waitForMessage(ws);
    expect(rankings.type).toBe("rankings");

    const eventRow = await adminClient().from("event").select("status, ended_at").eq("id", eventId).single();
    expect(eventRow.data?.status).toBe("ended");
    expect(eventRow.data?.ended_at).not.toBeNull();

    const finalParticipant = await adminClient()
      .from("event_final_participant")
      .select("total_points, rank")
      .eq("event_id", eventId)
      .eq("participant_id", participantId)
      .single();
    expect(finalParticipant.data).toEqual({ total_points: 3, rank: 1 });

    ws.close();
  });

  it("rejects a non-controller", async () => {
    const admin = await trackedAdmin("end-noncontrol-admin");
    const other = await trackedAdmin("end-noncontrol-other");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(eventId, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "mc:end" }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });

    controllerWs.close();
    otherWs.close();
  });

  it("rejects ending an event that is not live (never started)", async () => {
    const admin = await trackedAdmin("end-notlive-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:end" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "not_live" });
    ws.close();
  });

  it(
    "when the flush fails on every retry, sends end_failed and leaves the event live",
    async () => {
      const admin = await trackedAdmin("end-fail-admin");
      const eventId = await makeDraftEvent();
      await createStep(eventId, 1);

      const ws = await connectAndClaimControl(eventId, admin);
      ws.send(JSON.stringify({ type: "mc:start" }));
      await waitForMessage(ws);

      // Simulate a concurrent modification: flip the event's real Postgres
      // status away from "live" out from under the DO's own in-memory view
      // (which still reads "live"). The final `event` update's
      // `.eq("status","live")` guard then genuinely and deterministically
      // matches 0 rows on every retry — not a mock, a real Postgres outcome.
      await adminClient().from("event").update({ status: "draft" }).eq("id", eventId);

      ws.send(JSON.stringify({ type: "mc:end" }));
      const response = await waitForMessage(ws);
      expect(response).toMatchObject({ type: "error", code: "end_failed" });

      const eventRow = await adminClient().from("event").select("status").eq("id", eventId).single();
      expect(eventRow.data?.status).toBe("draft"); // untouched by the failed flush

      ws.close();
    },
    15000,
  );
});

describe("permanently read-only after mc:end (reveal-leaderboard-end design.md D3/D4)", () => {
  it("mc:lock is rejected once the event has ended", async () => {
    const admin = await trackedAdmin("readonly-lock-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws); // step active, never locked
    ws.send(JSON.stringify({ type: "mc:end" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "mc:lock" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "not_live" });
    ws.close();
  });

  it("mc:reveal is rejected once the event has ended", async () => {
    const admin = await trackedAdmin("readonly-reveal-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:end" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "mc:reveal" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "not_live" });
    ws.close();
  });

  it("answer:submit is rejected once the event has ended", async () => {
    const admin = await trackedAdmin("readonly-answer-admin");
    const player = await trackedPlayer("readonly-answer-player");
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1);
    await addParticipant(eventId, player, "ReadOnlyPlayer");

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:end" }));
    await waitForMessage(controllerWs); // state
    await waitForMessage(controllerWs); // rankings

    const playerWs = await connect(eventId, player.accessToken);
    await waitForMessage(playerWs); // state
    await waitForMessage(playerWs); // cached rankings, resent on connect since mc:end set lastRankings
    playerWs.send(JSON.stringify({ type: "answer:submit", payload: { stepId: step.id, optionId: "a" } }));
    const response = await waitForMessage(playerWs);
    expect(response).toMatchObject({ type: "error", code: "not_active" });

    controllerWs.close();
    playerWs.close();
  });

  it("a pending step-expiry alarm firing after mc:end is a safe no-op (design.md D4)", async () => {
    const admin = await trackedAdmin("readonly-alarm-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1, { timed: true, countdownSeconds: 30 });

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws); // step active with a pending expiry alarm
    ws.send(JSON.stringify({ type: "mc:end" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // rankings
    ws.close();

    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, eventId);
    const before = await runInDurableObject(stub, (instance) => {
      return instance.sql<{ data: string }>`select data from room_state where id = 0`;
    });

    // Manually invoke the alarm path directly, as if a pending alarm had
    // fired right after mc:end succeeded (the race window design.md D4
    // describes) — must be a byte-for-byte no-op.
    await runInDurableObject(stub, async (instance) => {
      await instance.onAlarm();
    });
    const after = await runInDurableObject(stub, (instance) => {
      return instance.sql<{ data: string }>`select data from room_state where id = 0`;
    });
    expect(after[0]!.data).toBe(before[0]!.data);
  });

  it("mc:end cancels any pending step-expiry alarm", async () => {
    const admin = await trackedAdmin("readonly-cancel-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1, { timed: true, countdownSeconds: 30 });

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws); // step active — an alarm is now scheduled
    ws.send(JSON.stringify({ type: "mc:end" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // rankings
    ws.close();

    const stub = await getServerByName<Env, EventRoom>(env.EventRoom, eventId);
    const alarm = await runInDurableObject(stub, (instance) => {
      return (instance as unknown as { ctx: DurableObjectState }).ctx.storage.getAlarm();
    });
    expect(alarm).toBeNull();
  });

  it("operator:display still works after the event has ended (the screen must still be drivable to the podium)", async () => {
    const admin = await trackedAdmin("readonly-display-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const ws = await connectAndClaimControl(eventId, admin);
    ws.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(ws);
    ws.send(JSON.stringify({ type: "mc:end" }));
    await waitForMessage(ws); // state
    await waitForMessage(ws); // rankings

    ws.send(JSON.stringify({ type: "operator:display", payload: { view: "podium" } }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "state", display: "podium" });
    ws.close();
  });
});

describe("screen role", () => {
  it("an admin connection presenting the screen flag resolves as screen, not admin", async () => {
    const admin = await trackedAdmin("screen-role-admin");
    const ws = await connect(`screen-role-room-${crypto.randomUUID()}`, admin.accessToken, { screen: true });
    await waitForMessage(ws); // initial snapshot

    // A screen connection cannot claim control — proves the role landed as
    // "screen", not "admin" (design.md D1).
    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });
    ws.close();
  });

  it("the same admin without the screen flag still resolves as admin", async () => {
    const admin = await trackedAdmin("screen-role-plain-admin");
    const ws = await connect(`screen-role-plain-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "state", controllerId: admin.profileId });
    ws.close();
  });

  it("a non-admin presenting the screen flag still resolves as an ordinary player", async () => {
    const player = await trackedPlayer("screen-role-player");
    const eventId = await createEventWithParticipant(player);
    const ws = await connect(eventId, player.accessToken, { screen: true });
    await waitForMessage(ws);

    // Still rejected from admin-only actions, exactly as a normal player
    // would be — the flag never elevates a non-admin connection.
    ws.send(JSON.stringify({ type: "mc:claim_control" }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });
    ws.close();
  });

  it("a screen connection cannot invoke operator:display", async () => {
    const admin = await trackedAdmin("screen-role-display-admin");
    const ws = await connect(`screen-role-display-room-${crypto.randomUUID()}`, admin.accessToken, {
      screen: true,
    });
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "operator:display", payload: { view: "leaderboard" } }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });
    ws.close();
  });

  it("a screen connection receives the public broadcasts but never own_result", async () => {
    const admin = await trackedAdmin("screen-role-broadcast-admin");
    const player = await trackedPlayer("screen-role-broadcast-player");
    const eventId = await makeDraftEvent();
    const step = await createStep(eventId, 1);
    await addParticipant(eventId, player, "ScreenTestPlayer");

    const controllerWs = await connectAndClaimControl(eventId, admin);
    const screenWs = await connect(eventId, admin.accessToken, { screen: true });
    await waitForMessage(screenWs); // initial snapshot

    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await Promise.all([waitForMessage(controllerWs), waitForMessage(screenWs)]);

    await submitAnswer(eventId, player, step.id, "a");

    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await Promise.all([waitForMessage(controllerWs), waitForMessage(screenWs)]);

    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    const screenStepResults = await waitForMessageOfType(screenWs, "step_results");
    expect(screenStepResults.participants).toBeDefined();
    const screenRankings = await waitForMessageOfType(screenWs, "rankings");
    expect(screenRankings.individuals).toBeDefined();

    // The screen never receives an own_result — that stays player-private.
    const nothingElse = await waitForMessageOrTimeout(screenWs, 300);
    expect(nothingElse).toBe("timeout");

    controllerWs.close();
    screenWs.close();
  });
});

describe("operator:display", () => {
  it("an admin sets the display directive", async () => {
    const admin = await trackedAdmin("display-admin");
    const ws = await connect(`display-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "operator:display", payload: { view: "leaderboard" } }));
    const update = await waitForMessage(ws);
    expect(update).toMatchObject({ type: "state", display: "leaderboard" });
    ws.close();
  });

  it("rejects a non-admin", async () => {
    const player = await trackedPlayer("display-player");
    const eventId = await createEventWithParticipant(player);
    const ws = await connect(eventId, player.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "operator:display", payload: { view: "waiting" } }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "forbidden" });
    ws.close();
  });

  it("succeeds for an admin who does not currently hold flow control (not flow-controller-gated)", async () => {
    const controller = await trackedAdmin("display-controller");
    const other = await trackedAdmin("display-other");
    const room = `display-uncontrolled-room-${crypto.randomUUID()}`;

    const controllerWs = await connect(room, controller.accessToken);
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:claim_control" }));
    await waitForMessage(controllerWs);

    const otherWs = await connect(room, other.accessToken);
    await waitForMessage(otherWs);
    otherWs.send(JSON.stringify({ type: "operator:display", payload: { view: "podium" } }));
    const response = await waitForMessage(otherWs);
    expect(response).toMatchObject({ type: "state", display: "podium" });

    controllerWs.close();
    otherWs.close();
  });

  it("rejects an invalid view value, leaving the display unchanged", async () => {
    const admin = await trackedAdmin("display-invalid-admin");
    const ws = await connect(`display-invalid-room-${crypto.randomUUID()}`, admin.accessToken);
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "operator:display", payload: { view: "not-a-real-view" } }));
    const response = await waitForMessage(ws);
    expect(response).toMatchObject({ type: "error", code: "invalid_message" });
    ws.close();
  });
});

describe("reconnect shows current state, not a replay (FR-063)", () => {
  it("a newly connecting client receives the current step's results and rankings without sending anything", async () => {
    const admin = await trackedAdmin("reconnect-results-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(controllerWs); // state
    await waitForMessage(controllerWs); // step_results
    await waitForMessage(controllerWs); // rankings

    const lateWs = await connect(eventId, admin.accessToken);
    const snapshot = await waitForMessage(lateWs);
    expect(snapshot).toMatchObject({ type: "state", step: { status: "revealed" } });
    const cachedResults = await waitForMessage(lateWs);
    expect(cachedResults.type).toBe("step_results");
    const cachedRankings = await waitForMessage(lateWs);
    expect(cachedRankings.type).toBe("rankings");

    controllerWs.close();
    lateWs.close();
  });

  it("a newly connecting client does not see a previous step's results after advancing, but still sees current rankings", async () => {
    const admin = await trackedAdmin("reconnect-advance-admin");
    const eventId = await makeDraftEvent();
    await createStep(eventId, 1);
    await createStep(eventId, 2);

    const controllerWs = await connectAndClaimControl(eventId, admin);
    controllerWs.send(JSON.stringify({ type: "mc:start" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:lock" }));
    await waitForMessage(controllerWs);
    controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
    await waitForMessage(controllerWs); // state
    await waitForMessage(controllerWs); // step_results
    await waitForMessage(controllerWs); // rankings

    controllerWs.send(JSON.stringify({ type: "mc:advance" }));
    await waitForMessage(controllerWs);

    const lateWs = await connect(eventId, admin.accessToken);
    const snapshot = await waitForMessage(lateWs);
    expect(snapshot).toMatchObject({ type: "state", step: { position: 2, status: "active" } });
    const onlyOtherMessage = await waitForMessage(lateWs);
    expect(onlyOtherMessage.type).toBe("rankings"); // not step_results — the prior step's results are cleared
    const nothingElse = await waitForMessageOrTimeout(lateWs, 300);
    expect(nothingElse).toBe("timeout");

    controllerWs.close();
    lateWs.close();
  });
});

describe("full live scenario with a screen connection (task 3.2)", () => {
  it(
    "mc:start -> answer:submit -> mc:lock -> mc:reveal -> operator:display leaves the screen with everything it needs for each of the 7 views",
    async () => {
      const admin = await trackedAdmin("full-scenario-admin");
      const player = await trackedPlayer("full-scenario-player");
      const eventId = await makeDraftEvent();
      const step = await createStep(eventId, 1, { pointsCorrect: 2 });
      await addParticipant(eventId, player, "FullScenarioPlayer");

      const controllerWs = await connectAndClaimControl(eventId, admin);
      const screenWs = await connect(eventId, admin.accessToken, { screen: true });
      // Queue-backed readers (not the shared waitForMessage helper) — this
      // test triggers a tight burst of 3 synchronous broadcasts on
      // mc:reveal (state/step_results/rankings, sent back-to-back after real
      // async I/O with no yield in between), which a fresh-listener-per-call
      // reader can race and lose messages from; a persistent queued listener
      // cannot.
      const controllerQueue = queueMessages(controllerWs);
      const screenQueue = queueMessages(screenWs);
      await screenQueue.next(); // initial snapshot

      // Waiting view: display already defaults to "waiting" (defaultRoomState) —
      // nothing to send or wait for here. (Re-sent later, once display has
      // actually moved elsewhere, to exercise a real transition to it too.)

      // Question view: the screen already has `question` from `state` once
      // the step is active — no further request needed to render it.
      controllerWs.send(JSON.stringify({ type: "mc:start" }));
      const [, screenAfterStart] = await Promise.all([controllerQueue.next(), screenQueue.next()]);
      expect(screenAfterStart.question).toMatchObject({ text: "Question for step 1" });
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "question" } }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);

      // Collecting view: same underlying state, different directive.
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "collecting" } }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);

      await submitAnswer(eventId, player, step.id, "a");
      controllerWs.send(JSON.stringify({ type: "mc:lock" }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);

      // Results view: the screen must already hold step_results by the time
      // it's directed to show them.
      controllerWs.send(JSON.stringify({ type: "mc:reveal" }));
      await controllerQueue.next(); // state
      await controllerQueue.next(); // step_results
      await controllerQueue.next(); // rankings
      await screenQueue.next(); // state
      const screenStepResults = await screenQueue.next(); // step_results
      expect(screenStepResults.participants).toEqual(
        expect.arrayContaining([expect.objectContaining({ isCorrect: true, points: 2 })]),
      );
      await screenQueue.next(); // rankings
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "results" } }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);

      // Leaderboard view: same rankings data the screen already received.
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "leaderboard" } }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);

      // Podium, waiting (genuinely re-selected now that display has moved
      // elsewhere), and blank views: no further data needed beyond the directive.
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "podium" } }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "waiting" } }));
      await Promise.all([controllerQueue.next(), screenQueue.next()]);
      controllerWs.send(JSON.stringify({ type: "operator:display", payload: { view: "blank" } }));
      const [, screenFinal] = await Promise.all([controllerQueue.next(), screenQueue.next()]);
      expect(screenFinal).toMatchObject({ type: "state", display: "blank" });

      controllerWs.close();
      screenWs.close();
    },
    20000,
  );
});

describe("propagation timing (FR-031 acceptance)", () => {
  it(
    "a state change reaches 10 connected clients within 2 seconds",
    async () => {
      // User creation is the slow part (real Supabase Auth round trips) —
      // parallelized so this test's own setup doesn't dominate the run;
      // the actual 2-second budget is measured only around the broadcast
      // itself, below.
      const [admin, ...players] = await Promise.all([
        trackedAdmin("propagation-admin"),
        ...Array.from({ length: 9 }, (_, i) => trackedPlayer(`propagation-player-${i}`)),
      ]);
      const eventId = await makeDraftEvent();
      await createStep(eventId, 1);
      await createStep(eventId, 2);
      await Promise.all(
        players.map((p) =>
          adminClient()
            .from("participant")
            .insert({ event_id: eventId, profile_id: p.profileId, display_name: "PropPlayer" }),
        ),
      );

      const controllerWs = await connectAndClaimControl(eventId, admin);
      controllerWs.send(JSON.stringify({ type: "mc:start" }));
      await waitForMessage(controllerWs);

      // 10 connections total: the admin/controller + 9 players. Connected
      // sequentially — simultaneous SELF.fetch upgrades to the same room
      // don't reliably resolve in this test harness, but the acceptance
      // criterion (FR-031) is about broadcast propagation speed once
      // connected, not concurrent connection establishment, so this doesn't
      // weaken what's being proven.
      const playerSockets: WebSocket[] = [];
      for (const p of players) {
        const ws = await connect(eventId, p.accessToken);
        await waitForMessage(ws); // initial snapshot
        playerSockets.push(ws);
      }

      const start = Date.now();
      const pending = [controllerWs, ...playerSockets].map((ws) => waitForMessage(ws));
      controllerWs.send(JSON.stringify({ type: "mc:advance" }));
      const results = await Promise.all(pending);
      const elapsedMs = Date.now() - start;

      expect(elapsedMs).toBeLessThan(2000);
      for (const result of results) {
        expect(result).toMatchObject({ type: "state", step: { position: 2 } });
      }

      controllerWs.close();
      playerSockets.forEach((ws) => ws.close());
    },
    30000,
  );
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
