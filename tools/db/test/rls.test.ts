// RLS assertions against a real local Supabase stack (`supabase start`).
// Needs a fresh `supabase db reset` first — every insert below assumes an
// empty schema (unique join_codes etc.). See openspec/changes/data-model-rls/
// specs/data-model/spec.md for the requirements each block proves.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminClient, createAnonClient, createUserClient } from "../src/adminClient.js";
import { createAdmin, createAnonymousPlayer, createPlayer, type TestUser } from "../src/testUsers.js";

const admin = createAdminClient();

let adminUser: TestUser;
let playerA: TestUser; // participant of eventA
let playerB: TestUser; // participant of eventB — a different event, for cross-event denial

interface Row {
  id: string;
  [key: string]: unknown;
}

let eventA: Row;
let eventB: Row;
let eventLive: Row; // seeded already-`live`, for the content-lock tests
let stepA: Row;
let teamA: Row;
let participantA: Row;

beforeAll(async () => {
  adminUser = await createAdmin("rls-admin");
  playerA = await createPlayer("rls-player-a");
  playerB = await createPlayer("rls-player-b");

  eventA = (
    await admin
      .from("event")
      .insert({ join_code: "RLSA01", title: "Event A", language: "en", status: "draft" })
      .select()
      .single()
  ).data as Row;

  eventB = (
    await admin
      .from("event")
      .insert({ join_code: "RLSB01", title: "Event B", language: "en", status: "draft" })
      .select()
      .single()
  ).data as Row;

  eventLive = (
    await admin
      .from("event")
      .insert({ join_code: "RLSLIVE1", title: "Live Event", language: "en", status: "live" })
      .select()
      .single()
  ).data as Row;

  participantA = (
    await admin
      .from("participant")
      .insert({ event_id: eventA.id, profile_id: playerA.profileId, display_name: "Player A" })
      .select()
      .single()
  ).data as Row;

  await admin
    .from("participant")
    .insert({ event_id: eventB.id, profile_id: playerB.profileId, display_name: "Player B" });

  stepA = (
    await admin.from("step").insert({ event_id: eventA.id, position: 1 }).select().single()
  ).data as Row;

  await admin.from("game_mcq").insert({
    step_id: stepA.id,
    question_text: "2 + 2 = ?",
    options: [
      { id: "a", label: "3" },
      { id: "b", label: "4" },
    ],
    correct_option_id: "b",
  });

  teamA = (
    await admin.from("team").insert({ event_id: eventA.id, name: "Team Alpha" }).select().single()
  ).data as Row;
});

afterAll(async () => {
  // Only one `live` event may exist at a time (the partial unique index this
  // suite itself tests) — it's a genuinely global resource, so release it for
  // other test files/runs rather than leaving it live indefinitely.
  await admin.from("event").delete().eq("id", eventLive.id);
});

describe("Unauthenticated requests are denied", () => {
  it("a no-JWT (anon-role) request reads nothing from any table", async () => {
    const anon = createAnonClient();
    for (const table of ["event", "step", "team", "participant", "game_mcq", "answer"] as const) {
      const { data, error } = await anon.from(table).select("*");
      expect(error, `${table} select`).toBeNull();
      expect(data, `${table} should be empty for an unauthenticated request`).toEqual([]);
    }
  });
});

describe("A player is confined to their own participant data and their event's public content", () => {
  it("reads their own participant row", async () => {
    const client = createUserClient(playerA.accessToken);
    const { data } = await client.from("participant").select("*").eq("id", participantA.id);
    expect(data).toHaveLength(1);
  });

  it("cannot read another participant's row", async () => {
    const client = createUserClient(playerA.accessToken);
    const { data } = await client.from("participant").select("*").eq("profile_id", playerB.profileId);
    expect(data).toEqual([]);
  });

  it("reads event/step/team content for their own event", async () => {
    const client = createUserClient(playerA.accessToken);
    expect((await client.from("event").select("*").eq("id", eventA.id)).data).toHaveLength(1);
    expect((await client.from("step").select("*").eq("id", stepA.id)).data).toHaveLength(1);
    expect((await client.from("team").select("*").eq("id", teamA.id)).data).toHaveLength(1);
  });

  it("cannot read another event's data", async () => {
    const client = createUserClient(playerA.accessToken);
    expect((await client.from("event").select("*").eq("id", eventB.id)).data).toEqual([]);
  });

  it("cannot read question or answer-key content directly", async () => {
    const client = createUserClient(playerA.accessToken);
    const { data } = await client.from("game_mcq").select("*").eq("step_id", stepA.id);
    expect(data).toEqual([]);
  });
});

describe("Event content is admin-authored and locked once the event leaves draft", () => {
  it("a non-admin write to step content is rejected regardless of status", async () => {
    const client = createUserClient(playerA.accessToken);
    await client.from("step").update({ points_correct: 99 }).eq("id", stepA.id);
    const after = await admin.from("step").select("points_correct").eq("id", stepA.id).single();
    expect(after.data?.points_correct).not.toBe(99);
  });

  it("a non-admin write to event content is rejected regardless of status", async () => {
    const client = createUserClient(playerA.accessToken);
    await client.from("event").update({ title: "hijacked" }).eq("id", eventA.id);
    const after = await admin.from("event").select("title").eq("id", eventA.id).single();
    expect(after.data?.title).not.toBe("hijacked");
  });

  it("an admin can author step content while the event is draft", async () => {
    const client = createUserClient(adminUser.accessToken);
    const { data, error } = await client
      .from("step")
      .update({ points_correct: 7 })
      .eq("id", stepA.id)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const after = await admin.from("step").select("points_correct").eq("id", stepA.id).single();
    expect(after.data?.points_correct).toBe(7);
  });

  it("an admin can author game_mcq content while the event is draft", async () => {
    const client = createUserClient(adminUser.accessToken);
    const { data, error } = await client
      .from("game_mcq")
      .update({ question_text: "2 + 2 = ? (edited)" })
      .eq("step_id", stepA.id)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("content is locked once the event is no longer draft", async () => {
    const liveStep = (
      await admin.from("step").insert({ event_id: eventLive.id, position: 1 }).select().single()
    ).data as Row;

    const client = createUserClient(adminUser.accessToken);
    await client.from("step").update({ points_correct: 42 }).eq("id", liveStep.id);
    const after = await admin.from("step").select("points_correct").eq("id", liveStep.id).single();
    expect(after.data?.points_correct).not.toBe(42);

    await client.from("event").update({ title: "renamed while live" }).eq("id", eventLive.id);
    const eventAfter = await admin.from("event").select("title").eq("id", eventLive.id).single();
    expect(eventAfter.data?.title).not.toBe("renamed while live");
  });
});

describe("Administrative data is readable only by admins", () => {
  it("a player cannot read another participant's profile", async () => {
    const client = createUserClient(playerA.accessToken);
    const { data } = await client.from("profile").select("*").eq("id", playerB.profileId);
    expect(data).toEqual([]);
  });

  it("a player cannot read answer or result rows", async () => {
    const client = createUserClient(playerA.accessToken);
    for (const table of [
      "answer",
      "step_result_participant",
      "step_result_team",
      "event_final_participant",
      "event_final_team",
    ] as const) {
      const { data } = await client.from(table).select("*");
      expect(data, `${table} should be empty for a player`).toEqual([]);
    }
  });

  it("an admin can read game_mcq including the correct answer", async () => {
    const client = createUserClient(adminUser.accessToken);
    const { data } = await client.from("game_mcq").select("*").eq("step_id", stepA.id);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.correct_option_id).toBe("b");
  });
});

describe("Admin status is granted out-of-band, never through a self-service path", () => {
  it("signing up never grants admin status", async () => {
    const fresh = await createPlayer("rls-fresh-signup");
    const { data } = await admin.from("profile").select("is_admin").eq("id", fresh.profileId).single();
    expect(data?.is_admin).toBe(false);
  });

  it("only the promoted account has admin status", async () => {
    const promoted = await admin.from("profile").select("is_admin").eq("id", adminUser.profileId).single();
    expect(promoted.data?.is_admin).toBe(true);

    const notPromoted = await admin
      .from("profile")
      .select("is_admin")
      .eq("id", playerA.profileId)
      .single();
    expect(notPromoted.data?.is_admin).toBe(false);
  });
});

describe("A participant answers a given step at most once", () => {
  it("rejects a duplicate answer for the same step and participant", async () => {
    // Writes here come from the service-role client, standing in for the
    // Durable Object (the only real writer of `answer`; players never
    // write it directly — see the administrative-data policy above).
    const first = await admin.from("answer").insert({
      step_id: stepA.id,
      participant_id: participantA.id,
      option_id: "a",
      receipt_seq: 1,
      is_correct: false,
    });
    expect(first.error).toBeNull();

    const second = await admin.from("answer").insert({
      step_id: stepA.id,
      participant_id: participantA.id,
      option_id: "b",
      receipt_seq: 2,
      is_correct: true,
    });
    expect(second.error).not.toBeNull();
  });
});

describe("At most one event is live at a time", () => {
  it("rejects setting a second event to live while one already is", async () => {
    const { error } = await admin.from("event").update({ status: "live" }).eq("id", eventA.id);
    expect(error).not.toBeNull();

    const after = await admin.from("event").select("status").eq("id", eventA.id).single();
    expect(after.data?.status).toBe("draft");
  });
});

describe("Season standings aggregate across events", () => {
  let seasonPlayer: TestUser;
  let anonPlayer: TestUser;

  async function endedEventWithResult(joinCode: string, points: number, profileId: string) {
    const event = (
      await admin
        .from("event")
        .insert({ join_code: joinCode, title: "Season Event", language: "en", status: "ended", season_year: 2026 })
        .select()
        .single()
    ).data as Row;
    const participant = (
      await admin
        .from("participant")
        .insert({ event_id: event.id, profile_id: profileId, display_name: "Season Player" })
        .select()
        .single()
    ).data as Row;
    await admin
      .from("event_final_participant")
      .insert({ event_id: event.id, participant_id: participant.id, total_points: points, rank: 1 });
  }

  beforeAll(async () => {
    seasonPlayer = await createPlayer("rls-season");
    anonPlayer = await createAnonymousPlayer();

    await endedEventWithResult("SEASON01", 10, seasonPlayer.profileId);
    await endedEventWithResult("SEASON02", 15, seasonPlayer.profileId);
    await endedEventWithResult("SEASONANON", 100, anonPlayer.profileId);
  });

  it("sums an account holder's total across events in the same season", async () => {
    const { data } = await admin
      .from("season_score")
      .select("*")
      .eq("profile_id", seasonPlayer.profileId)
      .eq("season_year", 2026)
      .single();
    expect(data?.total_points).toBe(25);
  });

  it("excludes anonymous participants", async () => {
    const { data } = await admin.from("season_score").select("*").eq("profile_id", anonPlayer.profileId);
    expect(data).toEqual([]);
  });

  it("is readable only by admins", async () => {
    const playerClient = createUserClient(seasonPlayer.accessToken);
    const { data: playerView } = await playerClient.from("season_score").select("*");
    expect(playerView).toEqual([]);

    const adminClient = createUserClient(adminUser.accessToken);
    const { data: adminView } = await adminClient
      .from("season_score")
      .select("*")
      .eq("profile_id", seasonPlayer.profileId);
    expect(adminView).toHaveLength(1);
  });
});
