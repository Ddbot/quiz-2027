import { PartySocket } from "partysocket";

import { createAdminIdentity, createAnonymousIdentity, type Identity } from "./identities.js";
import type { Fixture, SecondEventFixture } from "./fixture.js";

interface AnyMessage {
  type: string;
  [key: string]: unknown;
}

function connect(port: string, room: string, token: string): Promise<PartySocket> {
  return new Promise((resolve, reject) => {
    const socket = new PartySocket({
      host: `127.0.0.1:${port}`,
      party: "event-room",
      room,
      query: { token },
    });
    const onOpen = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      resolve(socket);
    };
    const onError = (event: Event) => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      reject(new Error(`socket failed to open: ${String(event)}`));
    };
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
  });
}

/** Waits for the next message on this socket — safe here because every step in
 * the script below only reads from a socket immediately after either connecting
 * or sending on that same socket, with nothing else concurrently landing on it
 * in between (see design.md's scenario notes). */
function nextMessage(socket: PartySocket): Promise<AnyMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      socket.removeEventListener("message", onMessage);
      try {
        resolve(JSON.parse(event.data as string) as AnyMessage);
      } catch (err) {
        reject(err as Error);
      }
    };
    socket.addEventListener("message", onMessage);
  });
}

async function drain(socket: PartySocket, count: number): Promise<AnyMessage[]> {
  const messages: AnyMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(await nextMessage(socket));
  }
  return messages;
}

async function submitAnswer(socket: PartySocket, stepId: string, optionId: string): Promise<AnyMessage> {
  socket.send(JSON.stringify({ type: "answer:submit", payload: { stepId, optionId } }));
  const response = await nextMessage(socket);
  if (response.type === "error") {
    throw new Error(`answer:submit(${stepId}, ${optionId}) rejected: ${JSON.stringify(response)}`);
  }
  return response;
}

export interface ScenarioTiming {
  label: string;
  ms: number;
}

export interface ScenarioResult {
  timings: ScenarioTiming[];
  /** The late joiner, created mid-scenario — callers need its profileId to map to a participant row. */
  p10: Identity;
}

/**
 * Drives the whole fixed script over real partysocket connections
 * (design.md D4): admin claims control, starts, and locks/reveals/advances
 * through 3 steps while P1–P10 submit answers per the hand-calculated plan
 * in expected.ts. P10 (the late joiner) connects only after step 1's reveal.
 */
export async function runScenario(port: string, fixture: Fixture): Promise<ScenarioResult> {
  const timings: ScenarioTiming[] = [];
  const timeIt = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    const result = await fn();
    timings.push({ label, ms: Date.now() - start });
    return result;
  };

  const admin = await createAdminIdentity("admin");
  const adminSocket = await connect(port, fixture.eventId, admin.accessToken);
  await nextMessage(adminSocket); // initial snapshot

  const sockets = new Map<string, PartySocket>();
  for (const [label, identity] of Object.entries(fixture.identities)) {
    const socket = await connect(port, fixture.eventId, identity.accessToken);
    await nextMessage(socket); // initial snapshot
    sockets.set(label, socket);
  }
  /** Every access below is by a label known to exist in `fixture.identities` — a missing one is a real bug, not a normal case. */
  const socketFor = (label: string): PartySocket => {
    const socket = sockets.get(label);
    if (!socket) throw new Error(`no connected socket for ${label}`);
    return socket;
  };

  adminSocket.send(JSON.stringify({ type: "mc:claim_control" }));
  await nextMessage(adminSocket);

  adminSocket.send(JSON.stringify({ type: "mc:start" }));
  await nextMessage(adminSocket);
  const step1 = fixture.steps[0];

  // --- Step 1 (untimed, 10 pts, 6 team pts) ---
  await timeIt("step1 answers", async () => {
    await submitAnswer(socketFor("p1"), step1.id, "a"); // correct
    await submitAnswer(socketFor("p2"), step1.id, "a"); // correct
    await submitAnswer(socketFor("p5"), step1.id, "a"); // correct
    await submitAnswer(socketFor("p6"), step1.id, "a"); // correct
    await submitAnswer(socketFor("p8"), step1.id, "a"); // correct
    await submitAnswer(socketFor("p9"), step1.id, "b"); // incorrect
    // p3, p4, p7 deliberately don't answer.
  });

  adminSocket.send(JSON.stringify({ type: "mc:lock" }));
  await nextMessage(adminSocket);
  await timeIt("step1 reveal propagation", async () => {
    adminSocket.send(JSON.stringify({ type: "mc:reveal" }));
    await drain(adminSocket, 3); // state, step_results, rankings
  });

  // --- P10 joins late, only now that step 1 is revealed (design.md D4) ---
  const p10 = await createAnonymousIdentity("p10");
  const { error: joinError } = await p10.client.rpc("join_event", {
    p_join_code: fixture.joinCode,
    p_display_name: "Harness P10",
    p_over16_ack: true,
    p_marketing_consent: false,
  });
  if (joinError) throw new Error(`p10: join_event failed: ${joinError.message}`);
  const p10Socket = await connect(port, fixture.eventId, p10.accessToken);
  await nextMessage(p10Socket); // initial snapshot — should still show step 1 revealed

  adminSocket.send(JSON.stringify({ type: "mc:advance" }));
  await nextMessage(adminSocket);
  const step2 = fixture.steps[1];

  // --- Step 2 (timed, 10 pts, 6 team pts) — p1 sent-and-acked first so
  // "fastest correct" is unambiguous over a real network, not a millisecond
  // race. ---
  await timeIt("step2 answers", async () => {
    await submitAnswer(socketFor("p1"), step2.id, "a"); // correct, fastest
    await new Promise((resolve) => setTimeout(resolve, 300)); // clear separation
    await Promise.all([
      submitAnswer(socketFor("p2"), step2.id, "a"), // correct, not fastest
      submitAnswer(socketFor("p3"), step2.id, "a"), // correct, not fastest
      submitAnswer(socketFor("p4"), step2.id, "b"), // incorrect
      submitAnswer(socketFor("p5"), step2.id, "a"), // correct, not fastest
      submitAnswer(socketFor("p6"), step2.id, "b"), // incorrect
      submitAnswer(socketFor("p8"), step2.id, "a"), // correct, not fastest
      submitAnswer(socketFor("p9"), step2.id, "b"), // incorrect
      submitAnswer(p10Socket, step2.id, "a"), // correct, not fastest
      // p7 deliberately doesn't answer.
    ]);
  });

  adminSocket.send(JSON.stringify({ type: "mc:lock" }));
  await nextMessage(adminSocket);
  await timeIt("step2 reveal propagation", async () => {
    adminSocket.send(JSON.stringify({ type: "mc:reveal" }));
    await drain(adminSocket, 3);
  });

  adminSocket.send(JSON.stringify({ type: "mc:advance" }));
  await nextMessage(adminSocket);
  const step3 = fixture.steps[2];

  // --- Step 3 (untimed, 10 pts, 0 team pts) ---
  await timeIt("step3 answers", async () => {
    await Promise.all([
      submitAnswer(socketFor("p1"), step3.id, "a"), // correct
      submitAnswer(socketFor("p2"), step3.id, "b"), // incorrect
      submitAnswer(socketFor("p3"), step3.id, "a"), // correct
      submitAnswer(socketFor("p4"), step3.id, "a"), // correct
      submitAnswer(socketFor("p5"), step3.id, "b"), // incorrect
      submitAnswer(socketFor("p6"), step3.id, "a"), // correct
      submitAnswer(socketFor("p7"), step3.id, "a"), // correct
      submitAnswer(socketFor("p8"), step3.id, "b"), // incorrect
      submitAnswer(socketFor("p9"), step3.id, "a"), // correct
      submitAnswer(p10Socket, step3.id, "a"), // correct
    ]);
  });

  adminSocket.send(JSON.stringify({ type: "mc:lock" }));
  await nextMessage(adminSocket);
  await timeIt("step3 reveal propagation", async () => {
    adminSocket.send(JSON.stringify({ type: "mc:reveal" }));
    await drain(adminSocket, 3);
  });

  adminSocket.send(JSON.stringify({ type: "mc:show_leaderboard" }));
  await drain(adminSocket, 2); // state, rankings

  await timeIt("event end propagation", async () => {
    adminSocket.send(JSON.stringify({ type: "mc:end" }));
    await drain(adminSocket, 2); // state, rankings
  });

  adminSocket.close();
  p10Socket.close();
  for (const socket of sockets.values()) socket.close();

  return { timings, p10 };
}

export interface SecondEventScenarioResult {
  /** Whether a direct Postgres check ever observed both this event and the caller's other event as `live` at the same moment (concurrent-live-events design.md D3). */
  observedBothLive: boolean;
}

/**
 * Drives a minimal, self-contained second event to completion, concurrently
 * with whatever else the caller is running — deliberately separate from
 * `runScenario` above, which is untouched by this addition (design.md D3).
 * `checkBothLive` is polled after this event's own `mc:start` succeeds,
 * to deterministically catch a moment where both events are observably
 * live in Postgres at once, rather than assuming a race will overlap.
 */
export async function runSecondEventScenario(
  port: string,
  fixture: SecondEventFixture,
  checkBothLive: () => Promise<boolean>,
): Promise<SecondEventScenarioResult> {
  const admin = await createAdminIdentity("admin-b");
  const adminSocket = await connect(port, fixture.eventId, admin.accessToken);
  await nextMessage(adminSocket); // initial snapshot

  const sockets = new Map<string, PartySocket>();
  for (const [label, identity] of Object.entries(fixture.identities)) {
    const socket = await connect(port, fixture.eventId, identity.accessToken);
    await nextMessage(socket); // initial snapshot
    sockets.set(label, socket);
  }

  adminSocket.send(JSON.stringify({ type: "mc:claim_control" }));
  await nextMessage(adminSocket);

  adminSocket.send(JSON.stringify({ type: "mc:start" }));
  const started = await nextMessage(adminSocket);
  if (started.type === "error") {
    throw new Error(`second event mc:start rejected: ${JSON.stringify(started)}`);
  }

  let observedBothLive = false;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await checkBothLive()) {
      observedBothLive = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const q1 = sockets.get("q1");
  if (!q1) throw new Error("no connected socket for q1");
  await submitAnswer(q1, fixture.step.id, "a");
  // q2 deliberately doesn't answer — this event's own scoring isn't the
  // point (the main scenario already proves that); this just needs to
  // reach a real end-to-end completion.

  adminSocket.send(JSON.stringify({ type: "mc:lock" }));
  await nextMessage(adminSocket);
  adminSocket.send(JSON.stringify({ type: "mc:reveal" }));
  await drain(adminSocket, 3); // state, step_results, rankings

  adminSocket.send(JSON.stringify({ type: "mc:end" }));
  await drain(adminSocket, 2); // state, rankings

  adminSocket.close();
  for (const socket of sockets.values()) socket.close();

  return { observedBothLive };
}
