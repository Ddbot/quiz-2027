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
