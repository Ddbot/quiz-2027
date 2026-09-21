// event_dashboard RPC assertions — see
// openspec/changes/analytics-dashboard/specs/analytics/spec.md ("An admin
// can view a per-event analytics dashboard", "Completion rate reflects only
// the steps a participant was present for").
import { beforeAll, describe, expect, it } from "vitest";

import { createAdminClient, createUserClient } from "../src/adminClient.js";
import { createAdmin, createPlayer, type TestUser } from "../src/testUsers.js";

const admin = createAdminClient();

interface Row {
  id: string;
  [key: string]: unknown;
}

async function makeEvent(joinCode: string) {
  const { data, error } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "Dashboard Test", language: "en", status: "ended" })
    .select()
    .single();
  if (error) throw new Error(`makeEvent(${joinCode}) failed: ${error.message}`);
  return data as Row;
}

async function makeStep(eventId: string, position: number, timerStartedAt: string, revealed = true) {
  const { data, error } = await admin
    .from("step")
    .insert({
      event_id: eventId,
      position,
      status: revealed ? "revealed" : "pending",
      timer_started_at: timerStartedAt,
    })
    .select()
    .single();
  if (error) throw new Error(`makeStep(${position}) failed: ${error.message}`);
  return data as Row;
}

async function makeParticipant(
  eventId: string,
  profileId: string,
  displayName: string,
  joinedAtPosition: number,
  hidden = false,
) {
  const { data, error } = await admin
    .from("participant")
    .insert({
      event_id: eventId,
      profile_id: profileId,
      display_name: displayName,
      joined_at_position: joinedAtPosition,
      hidden,
    })
    .select()
    .single();
  if (error) throw new Error(`makeParticipant(${displayName}) failed: ${error.message}`);
  return data as Row;
}

let receiptSeq = 1;
async function makeAnswer(stepId: string, participantId: string, isCorrect: boolean, submittedAt: string) {
  const { error } = await admin.from("answer").insert({
    step_id: stepId,
    participant_id: participantId,
    option_id: "a",
    is_correct: isCorrect,
    submitted_at: submittedAt,
    receipt_seq: receiptSeq++,
  });
  if (error) throw new Error(`makeAnswer failed: ${error.message}`);
}

function msAfter(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

describe("event_dashboard", () => {
  let event: Row;
  let admin_: TestUser;
  let participantA: Row; // present from the start
  let participantB: Row; // late joiner, present from step 2
  let participantC: Row; // hidden — still counted
  let step1: Row;
  let step2: Row;
  let step3: Row;

  beforeAll(async () => {
    event = await makeEvent("DASH1");
    admin_ = await createAdmin("dashboard-admin");

    const t1 = "2026-09-21T10:00:00.000Z";
    const t2 = "2026-09-21T10:10:00.000Z";
    const t3 = "2026-09-21T10:20:00.000Z";
    step1 = await makeStep(event.id, 1, t1);
    step2 = await makeStep(event.id, 2, t2);
    step3 = await makeStep(event.id, 3, t3);

    const playerA = await createPlayer("dashboard-participant-a");
    const playerB = await createPlayer("dashboard-participant-b");
    const playerC = await createPlayer("dashboard-participant-c");
    participantA = await makeParticipant(event.id, playerA.profileId, "Alice", 0);
    participantB = await makeParticipant(event.id, playerB.profileId, "LateBob", 2);
    participantC = await makeParticipant(event.id, playerC.profileId, "HiddenCara", 0, true);

    // Every answer is submitted exactly 2000ms after its step's
    // timer_started_at, so avg_response_ms hand-verifies to exactly 2000
    // regardless of which step/participant it belongs to.
    await makeAnswer(step1.id, participantA.id, true, msAfter(t1, 2000));
    await makeAnswer(step1.id, participantC.id, true, msAfter(t1, 2000));
    await makeAnswer(step2.id, participantA.id, true, msAfter(t2, 2000));
    await makeAnswer(step2.id, participantB.id, false, msAfter(t2, 2000));
    await makeAnswer(step2.id, participantC.id, true, msAfter(t2, 2000));
    await makeAnswer(step3.id, participantB.id, true, msAfter(t3, 2000));
    await makeAnswer(step3.id, participantC.id, true, msAfter(t3, 2000));
    // participantA never answers step3; participantB never answers step1 —
    // both are legitimate gaps the completion-rate math must reflect.

    const finalParticipants = await admin.from("event_final_participant").insert([
      { event_id: event.id, participant_id: participantA.id, total_points: 10, rank: 2 },
      { event_id: event.id, participant_id: participantC.id, total_points: 15, rank: 1 },
    ]);
    if (finalParticipants.error) throw new Error(`event_final_participant insert failed: ${finalParticipants.error.message}`);

    const team = await admin.from("team").insert({ event_id: event.id, name: "Solo Team" }).select().single();
    if (team.error) throw new Error(`team insert failed: ${team.error.message}`);
    const finalTeam = await admin
      .from("event_final_team")
      .insert({ event_id: event.id, team_id: team.data.id, total_awarded: 5, rank: 1 });
    if (finalTeam.error) throw new Error(`event_final_team insert failed: ${finalTeam.error.message}`);
  });

  it("computes participant_count, completion_rate, per_question, avg_response_ms, and final rankings", async () => {
    const client = createUserClient(admin_.accessToken);
    const { data, error } = await client.rpc("event_dashboard", { p_event_id: event.id });
    expect(error).toBeNull();

    // 3 participants total, including the hidden one (design D5).
    expect(data.participant_count).toBe(3);

    // 7 answers total / (A:3 + B:2 + C:3 = 8 present-steps) = 0.875.
    expect(data.completion_rate).toBeCloseTo(0.875, 10);

    expect(data.per_question).toEqual([
      { step_id: step1.id, correct: 2, incorrect: 0 },
      { step_id: step2.id, correct: 2, incorrect: 1 },
      { step_id: step3.id, correct: 2, incorrect: 0 },
    ]);

    expect(data.avg_response_ms).toBeCloseTo(2000, 0);

    expect(data.final_participants).toEqual([
      { participant_id: participantC.id, display_name: "HiddenCara", total_points: 15, rank: 1 },
      { participant_id: participantA.id, display_name: "Alice", total_points: 10, rank: 2 },
    ]);
    expect(data.final_teams).toEqual([
      expect.objectContaining({ name: "Solo Team", total_awarded: 5, rank: 1 }),
    ]);
  });

  it("never includes any participant's email address", async () => {
    const client = createUserClient(admin_.accessToken);
    const { data } = await client.rpc("event_dashboard", { p_event_id: event.id });
    const raw = JSON.stringify(data);
    // None of these participants' real emails (from createPlayer) appear anywhere.
    expect(raw).not.toContain("@example.com");
  });

  it("rejects a non-admin", async () => {
    const nonAdmin = await createPlayer("dashboard-nonadmin");
    const client = createUserClient(nonAdmin.accessToken);
    const { error } = await client.rpc("event_dashboard", { p_event_id: event.id });
    expect(error?.message).toBe("forbidden");
  });

  it("returns completion_rate 0, not an error, when no step has been revealed yet", async () => {
    const freshEvent = await makeEvent("DASH2");
    await makeStep(freshEvent.id, 1, "2026-09-21T11:00:00.000Z", false); // pending, not revealed
    const client = createUserClient(admin_.accessToken);
    const { data, error } = await client.rpc("event_dashboard", { p_event_id: freshEvent.id });
    expect(error).toBeNull();
    expect(data.completion_rate).toBe(0);
    expect(data.participant_count).toBe(0);
  });
});
