// export_my_data / delete_my_account / purge_expired_anonymous_participants
// assertions — see openspec/changes/gdpr-season-capture/specs/privacy/spec.md
// and specs/data-model/spec.md ("An anonymous participant's data is purged
// 90 days after their event ends").
import { describe, expect, it } from "vitest";

import { createAdminClient, createAnonClient, createUserClient } from "../src/adminClient.js";
import { createAnonymousPlayer, createPlayer } from "../src/testUsers.js";

const admin = createAdminClient();

interface Row {
  id: string;
  [key: string]: unknown;
}

async function makeEvent(joinCode: string, endedAt: string | null = null) {
  const { data, error } = await admin
    .from("event")
    .insert({
      join_code: joinCode,
      title: "GDPR Test",
      language: "en",
      status: endedAt ? "ended" : "draft",
      ended_at: endedAt,
    })
    .select()
    .single();
  if (error) throw new Error(`makeEvent(${joinCode}) failed: ${error.message}`);
  return data as Row;
}

async function makeParticipant(eventId: string, profileId: string, displayName: string) {
  const { data, error } = await admin
    .from("participant")
    .insert({ event_id: eventId, profile_id: profileId, display_name: displayName })
    .select()
    .single();
  if (error) throw new Error(`makeParticipant(${displayName}) failed: ${error.message}`);
  return data as Row;
}

async function makeAnswer(stepId: string, participantId: string) {
  const { error } = await admin.from("answer").insert({
    step_id: stepId,
    participant_id: participantId,
    option_id: "a",
    is_correct: true,
    receipt_seq: Math.floor(Math.random() * 1_000_000),
  });
  if (error) throw new Error(`makeAnswer failed: ${error.message}`);
}

async function makeStep(eventId: string, position: number) {
  const { data, error } = await admin.from("step").insert({ event_id: eventId, position }).select().single();
  if (error) throw new Error(`makeStep failed: ${error.message}`);
  return data as Row;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("export_my_data", () => {
  it("returns the caller's own profile, participants, and answers", async () => {
    const player = await createPlayer("export-happy-path");
    const event = await makeEvent("EXPORT1");
    const step = await makeStep(event.id, 1);
    const participant = await makeParticipant(event.id, player.profileId, "ExportMe");
    await makeAnswer(step.id, participant.id);

    const client = createUserClient(player.accessToken);
    const { data, error } = await client.rpc("export_my_data");
    expect(error).toBeNull();
    expect(data.profile.id).toBe(player.profileId);
    expect(data.participants).toEqual([expect.objectContaining({ id: participant.id, display_name: "ExportMe" })]);
    expect(data.answers).toEqual([expect.objectContaining({ step_id: step.id, is_correct: true })]);
  });

  it("never includes another identity's data", async () => {
    const playerA = await createPlayer("export-isolation-a");
    const playerB = await createPlayer("export-isolation-b");
    const event = await makeEvent("EXPORT2");
    await makeParticipant(event.id, playerA.profileId, "PlayerA");
    await makeParticipant(event.id, playerB.profileId, "PlayerB");

    const clientA = createUserClient(playerA.accessToken);
    const { data } = await clientA.rpc("export_my_data");
    const names = (data.participants as { display_name: string }[]).map((p) => p.display_name);
    expect(names).toEqual(["PlayerA"]);
  });

  it("rejects an unauthenticated call", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("export_my_data");
    expect(error).not.toBeNull();
  });
});

describe("delete_my_account", () => {
  it("clears profile display_name/email and sets deleted_at", async () => {
    const player = await createPlayer("delete-profile-fields");
    const client = createUserClient(player.accessToken);
    const { error } = await client.rpc("delete_my_account");
    expect(error).toBeNull();

    const profile = await admin
      .from("profile")
      .select("display_name, email, deleted_at")
      .eq("id", player.profileId)
      .single();
    expect(profile.data?.display_name).toBeNull();
    expect(profile.data?.email).toBeNull();
    expect(profile.data?.deleted_at).not.toBeNull();
  });

  it("rewrites participant display names across multiple events", async () => {
    const player = await createPlayer("delete-multi-event");
    const eventA = await makeEvent("DELMULTI1");
    const eventB = await makeEvent("DELMULTI2");
    await makeParticipant(eventA.id, player.profileId, "Alice A");
    await makeParticipant(eventB.id, player.profileId, "Alice B");

    const client = createUserClient(player.accessToken);
    await client.rpc("delete_my_account");

    const rows = await admin.from("participant").select("display_name").eq("profile_id", player.profileId);
    expect((rows.data ?? []).map((r) => r.display_name)).toEqual(["Compte supprimé", "Compte supprimé"]);
  });

  it("leaves score rows untouched", async () => {
    const player = await createPlayer("delete-scores-untouched");
    const event = await makeEvent("DELSCORES");
    const step = await makeStep(event.id, 1);
    const participant = await makeParticipant(event.id, player.profileId, "ScoredPlayer");
    const stepResult = await admin
      .from("step_result_participant")
      .insert({ step_id: step.id, participant_id: participant.id, points: 7 });
    if (stepResult.error) throw new Error(stepResult.error.message);
    const finalRow = await admin
      .from("event_final_participant")
      .insert({ event_id: event.id, participant_id: participant.id, total_points: 7, rank: 1 });
    if (finalRow.error) throw new Error(finalRow.error.message);

    const client = createUserClient(player.accessToken);
    await client.rpc("delete_my_account");

    const check = await admin
      .from("event_final_participant")
      .select("total_points, rank")
      .eq("participant_id", participant.id)
      .single();
    expect(check.data).toEqual({ total_points: 7, rank: 1 });
  });

  it("two different deleted accounts who both played the same event both succeed (design.md D1)", async () => {
    const playerA = await createPlayer("delete-shared-event-a");
    const playerB = await createPlayer("delete-shared-event-b");
    const event = await makeEvent("DELSHARED");
    await makeParticipant(event.id, playerA.profileId, "SharedA");
    await makeParticipant(event.id, playerB.profileId, "SharedB");

    const clientA = createUserClient(playerA.accessToken);
    const clientB = createUserClient(playerB.accessToken);
    const resultA = await clientA.rpc("delete_my_account");
    const resultB = await clientB.rpc("delete_my_account");
    expect(resultA.error).toBeNull();
    expect(resultB.error).toBeNull();
  });

  it("is idempotent — deleted_at does not move on a second call", async () => {
    const player = await createPlayer("delete-idempotent");
    const client = createUserClient(player.accessToken);
    await client.rpc("delete_my_account");
    const first = await admin.from("profile").select("deleted_at").eq("id", player.profileId).single();

    await new Promise((resolve) => setTimeout(resolve, 50));
    const second_ = await client.rpc("delete_my_account");
    expect(second_.error).toBeNull();
    const second = await admin.from("profile").select("deleted_at").eq("id", player.profileId).single();
    expect(second.data?.deleted_at).toBe(first.data?.deleted_at);
  });
});

describe("purge_expired_anonymous_participants (time-travel)", () => {
  it("purges an anonymous participant of an event ended 91 days ago, cascading their answers/scores", async () => {
    const anon = await createAnonymousPlayer();
    const event = await makeEvent("PURGE91", daysAgo(91));
    const step = await makeStep(event.id, 1);
    const participant = await makeParticipant(event.id, anon.profileId, "OldAnon");
    await makeAnswer(step.id, participant.id);
    const stepResult = await admin
      .from("step_result_participant")
      .insert({ step_id: step.id, participant_id: participant.id, points: 3 });
    if (stepResult.error) throw new Error(stepResult.error.message);
    const finalRow = await admin
      .from("event_final_participant")
      .insert({ event_id: event.id, participant_id: participant.id, total_points: 3, rank: 1 });
    if (finalRow.error) throw new Error(finalRow.error.message);

    const { data: purgedCount, error } = await admin.rpc("purge_expired_anonymous_participants");
    expect(error).toBeNull();
    expect(purgedCount as number).toBeGreaterThanOrEqual(1);

    const check = await admin.from("participant").select("id").eq("id", participant.id);
    expect(check.data).toEqual([]);
    const answerCheck = await admin.from("answer").select("id").eq("step_id", step.id);
    expect(answerCheck.data).toEqual([]);
    const finalCheck = await admin.from("event_final_participant").select("*").eq("participant_id", participant.id);
    expect(finalCheck.data).toEqual([]);
  });

  it("leaves an anonymous participant of an event ended only 89 days ago untouched", async () => {
    const anon = await createAnonymousPlayer();
    const event = await makeEvent("PURGE89", daysAgo(89));
    const participant = await makeParticipant(event.id, anon.profileId, "RecentAnon");

    await admin.rpc("purge_expired_anonymous_participants");

    const check = await admin.from("participant").select("id").eq("id", participant.id);
    expect(check.data).toHaveLength(1);
  });

  it("leaves an account-holding participant of an event ended 91 days ago untouched", async () => {
    const player = await createPlayer("purge-account-holder");
    const event = await makeEvent("PURGEACCT", daysAgo(91));
    const participant = await makeParticipant(event.id, player.profileId, "AccountHolder");

    await admin.rpc("purge_expired_anonymous_participants");

    const check = await admin.from("participant").select("id").eq("id", participant.id);
    expect(check.data).toHaveLength(1);
  });

  it("clears team captaincy before purging a captain, rather than being blocked by it", async () => {
    const anon = await createAnonymousPlayer();
    const event = await makeEvent("PURGECAPTAIN", daysAgo(91));
    const participant = await makeParticipant(event.id, anon.profileId, "CaptainAnon");
    const team = await admin
      .from("team")
      .insert({ event_id: event.id, name: "Doomed Team", captain_participant_id: participant.id })
      .select()
      .single();
    if (team.error) throw new Error(team.error.message);

    const { error } = await admin.rpc("purge_expired_anonymous_participants");
    expect(error).toBeNull();

    const participantCheck = await admin.from("participant").select("id").eq("id", participant.id);
    expect(participantCheck.data).toEqual([]);
    const teamCheck = await admin
      .from("team")
      .select("captain_participant_id")
      .eq("id", (team.data as Row).id)
      .single();
    expect(teamCheck.data?.captain_participant_id).toBeNull();
  });
});
