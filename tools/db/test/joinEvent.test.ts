// join_event RPC assertions — see openspec/changes/auth-onboarding/specs/data-model/spec.md
// ("join_event is the sole path for a player to create their own participant row").
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminClient, createAnonClient, createUserClient } from "../src/adminClient.js";
import { createPlayer, type TestUser } from "../src/testUsers.js";

const admin = createAdminClient();

interface Row {
  id: string;
  [key: string]: unknown;
}

async function makeEvent(joinCode: string, status: "draft" | "live" | "ended") {
  const { data, error } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "Join Event Test", language: "en", status })
    .select()
    .single();
  if (error) throw new Error(`makeEvent(${joinCode}) failed: ${error.message}`);
  return data as Row;
}

describe("join_event", () => {
  let draftEvent: Row;
  let liveEvent: Row;
  let endedEvent: Row;
  let player: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("JOINDRAFT", "draft");
    liveEvent = await makeEvent("JOINLIVE", "live");
    endedEvent = await makeEvent("JOINENDED", "ended");
    player = await createPlayer("join-event-player");
  });

  afterAll(async () => {
    // Only one `live` event may exist at a time — release the slot for other
    // test files/runs (see rls.test.ts's matching cleanup).
    await admin.from("event").delete().eq("id", liveEvent.id);
  });

  it("records first-time consent on the profile", async () => {
    const consentPlayer = await createPlayer("consent-player");
    const client = createUserClient(consentPlayer.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: draftEvent.join_code,
      p_display_name: "ConsentTester",
      p_over16_ack: true,
      p_marketing_consent: false,
    });
    expect(error).toBeNull();

    const profile = await admin
      .from("profile")
      .select("over16_ack, marketing_consent, tos_accepted_at")
      .eq("id", consentPlayer.profileId)
      .single();
    expect(profile.data?.over16_ack).toBe(true);
    expect(profile.data?.marketing_consent).toBe(false);
    expect(profile.data?.tos_accepted_at).not.toBeNull();
  });

  it("leaves consent fields untouched when not provided (returning identity)", async () => {
    const returningPlayer = await createPlayer("returning-player");
    const client = createUserClient(returningPlayer.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: draftEvent.join_code,
      p_display_name: "Returning",
    });
    expect(error).toBeNull();

    const profile = await admin
      .from("profile")
      .select("over16_ack, tos_accepted_at")
      .eq("id", returningPlayer.profileId)
      .single();
    expect(profile.data?.over16_ack).toBe(false);
    expect(profile.data?.tos_accepted_at).toBeNull();
  });

  it("creates a participant for a valid join code (draft event)", async () => {
    const client = createUserClient(player.accessToken);
    const { data, error } = await client.rpc("join_event", {
      p_join_code: draftEvent.join_code,
      p_display_name: "Alice",
    });
    expect(error).toBeNull();
    expect(data.participant.display_name).toBe("Alice");
    expect(data.event.id).toBe(draftEvent.id);

    const check = await admin
      .from("participant")
      .select("*")
      .eq("event_id", draftEvent.id)
      .eq("profile_id", player.profileId);
    expect(check.data).toHaveLength(1);
  });

  it("is idempotent — repeat join returns the same participant", async () => {
    const client = createUserClient(player.accessToken);
    const first = await client.rpc("join_event", {
      p_join_code: liveEvent.join_code,
      p_display_name: "Alice",
    });
    expect(first.error).toBeNull();

    const second = await client.rpc("join_event", {
      p_join_code: liveEvent.join_code,
      p_display_name: "Alice",
    });
    expect(second.error).toBeNull();
    expect(second.data.participant.id).toBe(first.data.participant.id);

    const count = await admin
      .from("participant")
      .select("*", { count: "exact", head: true })
      .eq("event_id", liveEvent.id)
      .eq("profile_id", player.profileId);
    expect(count.count).toBe(1);
  });

  it("allows joining a live event (late joiner)", async () => {
    const lateJoiner = await createPlayer("late-joiner");
    const client = createUserClient(lateJoiner.accessToken);
    const { data, error } = await client.rpc("join_event", {
      p_join_code: liveEvent.join_code,
      p_display_name: "LateBob",
    });
    expect(error).toBeNull();
    expect(data.event.status).toBe("live");
  });

  it("rejects an unknown join code", async () => {
    const client = createUserClient(player.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: "NOSUCHCODE",
      p_display_name: "Alice",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toBe("invalid_code");
  });

  it("rejects joining an ended event", async () => {
    const client = createUserClient(player.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: endedEvent.join_code,
      p_display_name: "Alice",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toBe("event_not_joinable");
  });

  it("rejects a profane display name", async () => {
    const profaneJoiner = await createPlayer("profane-joiner");
    const client = createUserClient(profaneJoiner.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: draftEvent.join_code,
      p_display_name: "such a bullshit name",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toBe("profanity");
  });

  it("denies a direct insert into participant, bypassing join_event", async () => {
    const directInserter = await createPlayer("direct-insert-player");
    const client = createUserClient(directInserter.accessToken);
    const { error } = await client.from("participant").insert({
      event_id: draftEvent.id,
      profile_id: directInserter.profileId,
      display_name: "Sneaky",
    });
    expect(error).not.toBeNull();

    const check = await admin
      .from("participant")
      .select("*")
      .eq("event_id", draftEvent.id)
      .eq("profile_id", directInserter.profileId);
    expect(check.data).toEqual([]);
  });
});

describe("join_event stamps joined_at_position (analytics-dashboard design D1)", () => {
  let draftEvent: Row;
  let liveEventNoStep: Row;
  let liveEventWithStep: Row;
  let stepTwo: Row;

  beforeAll(async () => {
    draftEvent = await makeEvent("POSDRAFT", "draft");
    // Deliberately left `draft` (not `live`) — only one `live` event may
    // exist system-wide at a time, and `join_event`'s position resolution
    // depends only on `current_step_id` being null, not on `status` itself,
    // so a second live event here would test nothing this one doesn't.
    liveEventNoStep = await makeEvent("POSLIVE1", "draft");

    liveEventWithStep = await makeEvent("POSLIVE2", "draft");
    const stepOne = await admin
      .from("step")
      .insert({ event_id: liveEventWithStep.id, position: 1 })
      .select()
      .single();
    if (stepOne.error) throw new Error(`step 1 insert failed: ${stepOne.error.message}`);
    const stepTwoResult = await admin
      .from("step")
      .insert({ event_id: liveEventWithStep.id, position: 2 })
      .select()
      .single();
    if (stepTwoResult.error) throw new Error(`step 2 insert failed: ${stepTwoResult.error.message}`);
    stepTwo = stepTwoResult.data as Row;

    // Simulate mc:start/mc:advance having reached step 2 — this is exactly
    // what EventRoom.ts's handleMcStart/handleMcAdvance now write to
    // Postgres (design D2), reproduced directly here since this RPC's
    // behavior is fully determined by Postgres state, independent of the
    // Durable Object layer.
    const update = await admin
      .from("event")
      .update({ status: "live", current_step_id: stepTwo.id })
      .eq("id", liveEventWithStep.id);
    if (update.error) throw new Error(`event update failed: ${update.error.message}`);
  });

  afterAll(async () => {
    await admin.from("event").delete().eq("id", liveEventNoStep.id);
    await admin.from("event").delete().eq("id", liveEventWithStep.id);
  });

  it("stamps 0 for a participant joining before the event starts", async () => {
    const joiner = await createPlayer("pos-draft-joiner");
    const client = createUserClient(joiner.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: draftEvent.join_code,
      p_display_name: "DraftJoiner",
    });
    expect(error).toBeNull();

    const row = await admin
      .from("participant")
      .select("joined_at_position")
      .eq("event_id", draftEvent.id)
      .eq("profile_id", joiner.profileId)
      .single();
    expect(row.data?.joined_at_position).toBe(0);
  });

  it("stamps 0 for an event with no current step recorded yet", async () => {
    const joiner = await createPlayer("pos-live-nostep-joiner");
    const client = createUserClient(joiner.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: liveEventNoStep.join_code,
      p_display_name: "NoStepJoiner",
    });
    expect(error).toBeNull();

    const row = await admin
      .from("participant")
      .select("joined_at_position")
      .eq("event_id", liveEventNoStep.id)
      .eq("profile_id", joiner.profileId)
      .single();
    expect(row.data?.joined_at_position).toBe(0);
  });

  it("stamps the current step's position for a late joiner", async () => {
    const lateJoiner = await createPlayer("pos-late-joiner");
    const client = createUserClient(lateJoiner.accessToken);
    const { error } = await client.rpc("join_event", {
      p_join_code: liveEventWithStep.join_code,
      p_display_name: "LateJoiner",
    });
    expect(error).toBeNull();

    const row = await admin
      .from("participant")
      .select("joined_at_position")
      .eq("event_id", liveEventWithStep.id)
      .eq("profile_id", lateJoiner.profileId)
      .single();
    expect(row.data?.joined_at_position).toBe(stepTwo.position);
  });

  it("leaves joined_at_position unchanged on a repeat join, even if the current step later advances", async () => {
    const joiner = await createPlayer("pos-repeat-joiner");
    const client = createUserClient(joiner.accessToken);
    await client.rpc("join_event", {
      p_join_code: liveEventWithStep.join_code,
      p_display_name: "RepeatJoiner",
    });
    const firstRow = await admin
      .from("participant")
      .select("joined_at_position")
      .eq("event_id", liveEventWithStep.id)
      .eq("profile_id", joiner.profileId)
      .single();
    expect(firstRow.data?.joined_at_position).toBe(stepTwo.position);

    // The event "advances" further — a repeat join must not recompute.
    await admin.from("event").update({ current_step_id: null }).eq("id", liveEventWithStep.id);
    await client.rpc("join_event", {
      p_join_code: liveEventWithStep.join_code,
      p_display_name: "RepeatJoiner",
    });
    const secondRow = await admin
      .from("participant")
      .select("joined_at_position")
      .eq("event_id", liveEventWithStep.id)
      .eq("profile_id", joiner.profileId)
      .single();
    expect(secondRow.data?.joined_at_position).toBe(stepTwo.position);
  });
});

describe("event_public_summary", () => {
  let publicEvent: Row;

  beforeAll(async () => {
    publicEvent = await makeEvent("PUBSUMMARY", "draft");
  });

  it("is readable without any session", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from("event_public_summary")
      .select("*")
      .eq("join_code", publicEvent.join_code);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.title).toBe("Join Event Test");
  });

  it("returns nothing for an unknown join code", async () => {
    const anon = createAnonClient();
    const { data } = await anon.from("event_public_summary").select("*").eq("join_code", "NOSUCH");
    expect(data).toEqual([]);
  });

  it("never exposes administrative fields", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("event_public_summary").select("created_by");
    expect(error).not.toBeNull();
  });
});
