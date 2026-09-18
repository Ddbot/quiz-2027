// moderate_participant / moderate_team RPC assertions — see
// openspec/changes/moderation-kill-switch/specs/data-model/spec.md
// ("An admin can hide or rename any participant or team").
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminClient, createUserClient } from "../src/adminClient.js";
import { createAdmin, createPlayer, type TestUser } from "../src/testUsers.js";

const admin = createAdminClient();

interface Row {
  id: string;
  [key: string]: unknown;
}

async function makeEvent(joinCode: string, status: "draft" | "live" | "ended") {
  const { data, error } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "Moderation Test", language: "en", status })
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
  if (error) throw new Error(`makeParticipant failed: ${error.message}`);
  return data as Row;
}

async function makeTeam(eventId: string, name: string) {
  const { data, error } = await admin
    .from("team")
    .insert({ event_id: eventId, name })
    .select()
    .single();
  if (error) throw new Error(`makeTeam(${name}) failed: ${error.message}`);
  return data as Row;
}

// Only one `live` event is allowed system-wide at a time (event_one_live_idx)
// — shared by both describe blocks' "works while live" cases below, rather
// than each creating its own.
let liveEvent: Row;

beforeAll(async () => {
  liveEvent = await makeEvent("MODLIVE1", "live");
});

afterAll(async () => {
  // Only one `live` event may exist at a time — release the slot for other
  // test files/runs (see rls.test.ts's matching cleanup).
  await admin.from("event").delete().eq("id", liveEvent.id);
});

describe("moderate_participant", () => {
  let draftEvent: Row;
  let moderator: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("MODPART1", "draft");
    moderator = await createAdmin("moderation-participant-admin");
    nonAdmin = await createPlayer("moderation-participant-nonadmin");
  });

  it("hides a participant", async () => {
    const target = await createPlayer("moderation-hide-target");
    const participant = await makeParticipant(draftEvent.id, target.profileId, "HideMe");
    const client = createUserClient(moderator.accessToken);
    const { data, error } = await client.rpc("moderate_participant", {
      p_participant_id: participant.id,
      p_hidden: true,
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(true);
  });

  it("renames a participant", async () => {
    const target = await createPlayer("moderation-rename-target");
    const participant = await makeParticipant(draftEvent.id, target.profileId, "OldName");
    const client = createUserClient(moderator.accessToken);
    const { data, error } = await client.rpc("moderate_participant", {
      p_participant_id: participant.id,
      p_display_name: "NewName",
    });
    expect(error).toBeNull();
    expect(data.display_name).toBe("NewName");
  });

  it("rejects a profane rename", async () => {
    const target = await createPlayer("moderation-profane-target");
    const participant = await makeParticipant(draftEvent.id, target.profileId, "CleanName");
    const client = createUserClient(moderator.accessToken);
    const { error } = await client.rpc("moderate_participant", {
      p_participant_id: participant.id,
      p_display_name: "such a bullshit name",
    });
    expect(error?.message).toBe("profanity");
  });

  it("works while the event is live, unlike ordinary event/team authoring", async () => {
    const target = await createPlayer("moderation-live-target");
    const participant = await makeParticipant(liveEvent.id, target.profileId, "LiveParticipant");
    const client = createUserClient(moderator.accessToken);
    const { data, error } = await client.rpc("moderate_participant", {
      p_participant_id: participant.id,
      p_hidden: true,
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(true);
  });

  it("rejects a non-admin", async () => {
    const target = await createPlayer("moderation-nonadmin-target");
    const participant = await makeParticipant(draftEvent.id, target.profileId, "NonAdminTarget");
    const client = createUserClient(nonAdmin.accessToken);
    const { error } = await client.rpc("moderate_participant", {
      p_participant_id: participant.id,
      p_hidden: true,
    });
    expect(error?.message).toBe("forbidden");
  });
});

describe("moderate_team", () => {
  let draftEvent: Row;
  let moderator: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("MODTEAM1", "draft");
    moderator = await createAdmin("moderation-team-admin");
    nonAdmin = await createPlayer("moderation-team-nonadmin");
  });

  it("hides a team", async () => {
    const team = await makeTeam(draftEvent.id, "Hide This Team");
    const client = createUserClient(moderator.accessToken);
    const { data, error } = await client.rpc("moderate_team", {
      p_team_id: team.id,
      p_hidden: true,
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(true);
  });

  it("renames a team", async () => {
    const team = await makeTeam(draftEvent.id, "Old Team Name");
    const client = createUserClient(moderator.accessToken);
    const { data, error } = await client.rpc("moderate_team", {
      p_team_id: team.id,
      p_name: "New Team Name",
    });
    expect(error).toBeNull();
    expect(data.name).toBe("New Team Name");
  });

  it("rejects a profane rename", async () => {
    const team = await makeTeam(draftEvent.id, "Clean Team Name");
    const client = createUserClient(moderator.accessToken);
    const { error } = await client.rpc("moderate_team", {
      p_team_id: team.id,
      p_name: "such a bullshit team",
    });
    expect(error?.message).toBe("profanity");
  });

  it("works while the event is live", async () => {
    const team = await makeTeam(liveEvent.id, "Live Team");
    const client = createUserClient(moderator.accessToken);
    const { data, error } = await client.rpc("moderate_team", {
      p_team_id: team.id,
      p_hidden: true,
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(true);
  });

  it("rejects a non-admin", async () => {
    const team = await makeTeam(draftEvent.id, "Non Admin Target Team");
    const client = createUserClient(nonAdmin.accessToken);
    const { error } = await client.rpc("moderate_team", {
      p_team_id: team.id,
      p_hidden: true,
    });
    expect(error?.message).toBe("forbidden");
  });
});
