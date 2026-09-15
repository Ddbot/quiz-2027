// Team RPC + dissolution-trigger assertions — see
// openspec/changes/team-lobby/specs/data-model/spec.md ("Team RPCs are the
// sole path for team-membership and team-name mutations" and "Team
// membership locks and under-sized teams dissolve when an event goes live").
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminClient, createUserClient } from "../src/adminClient.js";
import { createPlayer, type TestUser } from "../src/testUsers.js";

const admin = createAdminClient();

interface Row {
  id: string;
  [key: string]: unknown;
}

async function makeEvent(joinCode: string, status: "draft" | "live" | "ended") {
  const { data, error } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "Team Lobby Test", language: "en", status })
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

async function makeTeam(eventId: string, name: string, captainParticipantId: string | null = null) {
  const { data, error } = await admin
    .from("team")
    .insert({ event_id: eventId, name, captain_participant_id: captainParticipantId })
    .select()
    .single();
  if (error) throw new Error(`makeTeam(${name}) failed: ${error.message}`);
  return data as Row;
}

describe("create_team", () => {
  let draftEvent: Row;
  let endedEvent: Row;
  let captain: TestUser;
  let nonParticipant: TestUser;
  let endedEventParticipant: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("TEAMCREATE1", "draft");
    endedEvent = await makeEvent("TEAMCREATE2", "ended");
    captain = await createPlayer("create-team-captain");
    nonParticipant = await createPlayer("create-team-nonparticipant");
    endedEventParticipant = await createPlayer("create-team-ended-participant");
    await makeParticipant(draftEvent.id, captain.profileId, "Captain");
    await makeParticipant(endedEvent.id, endedEventParticipant.profileId, "EndedParticipant");
  });

  it("creates a team and assigns the creator as captain", async () => {
    const client = createUserClient(captain.accessToken);
    const { data, error } = await client.rpc("create_team", {
      p_event_id: draftEvent.id,
      p_name: "Alpha Squad",
    });
    expect(error).toBeNull();
    expect(data.team.name).toBe("Alpha Squad");
    expect(data.team.captain_participant_id).not.toBeNull();

    const participant = await admin
      .from("participant")
      .select("team_id")
      .eq("event_id", draftEvent.id)
      .eq("profile_id", captain.profileId)
      .single();
    expect(participant.data?.team_id).toBe(data.team.id);
  });

  it("rejects a non-participant", async () => {
    const client = createUserClient(nonParticipant.accessToken);
    const { error } = await client.rpc("create_team", {
      p_event_id: draftEvent.id,
      p_name: "Should Not Exist",
    });
    expect(error?.message).toBe("not_a_participant");
  });

  it("rejects a profane name", async () => {
    const profanePlayer = await createPlayer("create-team-profane");
    await makeParticipant(draftEvent.id, profanePlayer.profileId, "ProfanePlayer");
    const client = createUserClient(profanePlayer.accessToken);
    const { error } = await client.rpc("create_team", {
      p_event_id: draftEvent.id,
      p_name: "such a bullshit team",
    });
    expect(error?.message).toBe("profanity");
  });

  it("rejects a duplicate (case-insensitive) name", async () => {
    const dupPlayer = await createPlayer("create-team-dup");
    await makeParticipant(draftEvent.id, dupPlayer.profileId, "DupPlayer");
    const client = createUserClient(dupPlayer.accessToken);
    const { error } = await client.rpc("create_team", {
      p_event_id: draftEvent.id,
      p_name: "alpha squad", // same as "Alpha Squad" above, different case
    });
    expect(error?.message).toBe("name_taken");
  });

  it("rejects creation for a non-draft event", async () => {
    const client = createUserClient(endedEventParticipant.accessToken);
    const { error } = await client.rpc("create_team", {
      p_event_id: endedEvent.id,
      p_name: "Too Late",
    });
    expect(error?.message).toBe("event_not_joinable");
  });
});

describe("join_team", () => {
  let draftEvent: Row;
  let otherEvent: Row;
  let endedEvent: Row;
  let teamA: Row;
  let teamB: Row;
  let dissolvedTeam: Row;
  let otherEventTeam: Row;
  let endedEventTeam: Row;
  let joiner: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("TEAMJOIN1", "draft");
    otherEvent = await makeEvent("TEAMJOIN2", "draft");
    endedEvent = await makeEvent("TEAMJOIN3", "ended");
    teamA = await makeTeam(draftEvent.id, "Join Team A");
    teamB = await makeTeam(draftEvent.id, "Join Team B");
    dissolvedTeam = await makeTeam(draftEvent.id, "Dissolved Team");
    await admin.from("team").update({ dissolved: true }).eq("id", dissolvedTeam.id);
    otherEventTeam = await makeTeam(otherEvent.id, "Other Event Team");
    endedEventTeam = await makeTeam(endedEvent.id, "Ended Event Team");

    joiner = await createPlayer("join-team-player");
    await makeParticipant(draftEvent.id, joiner.profileId, "Joiner");
  });

  it("joins an open team with no cap", async () => {
    const secondJoiner = await createPlayer("join-team-second");
    await makeParticipant(draftEvent.id, secondJoiner.profileId, "SecondJoiner");

    const client1 = createUserClient(joiner.accessToken);
    const { error: e1 } = await client1.rpc("join_team", { p_team_id: teamA.id });
    expect(e1).toBeNull();

    const client2 = createUserClient(secondJoiner.accessToken);
    const { error: e2 } = await client2.rpc("join_team", { p_team_id: teamA.id });
    expect(e2).toBeNull();

    const members = await admin.from("participant").select("id").eq("team_id", teamA.id);
    expect(members.data).toHaveLength(2);
  });

  it("switches a participant directly to a different team", async () => {
    const client = createUserClient(joiner.accessToken);
    const { error } = await client.rpc("join_team", { p_team_id: teamB.id });
    expect(error).toBeNull();

    const participant = await admin
      .from("participant")
      .select("team_id")
      .eq("event_id", draftEvent.id)
      .eq("profile_id", joiner.profileId)
      .single();
    expect(participant.data?.team_id).toBe(teamB.id);

    const oldTeamMembers = await admin.from("participant").select("id").eq("team_id", teamA.id);
    expect(oldTeamMembers.data?.map((p) => p.id)).not.toContain(joiner.profileId);
  });

  it("rejects joining a dissolved team", async () => {
    const client = createUserClient(joiner.accessToken);
    const { error } = await client.rpc("join_team", { p_team_id: dissolvedTeam.id });
    expect(error?.message).toBe("team_dissolved");
  });

  it("rejects joining a team in a different event than the caller's participant", async () => {
    const client = createUserClient(joiner.accessToken);
    const { error } = await client.rpc("join_team", { p_team_id: otherEventTeam.id });
    expect(error?.message).toBe("not_a_participant");
  });

  it("rejects joining for a non-draft event", async () => {
    const endedParticipant = await createPlayer("join-team-ended");
    await makeParticipant(endedEvent.id, endedParticipant.profileId, "EndedJoiner");
    const client = createUserClient(endedParticipant.accessToken);
    const { error } = await client.rpc("join_team", { p_team_id: endedEventTeam.id });
    expect(error?.message).toBe("event_not_joinable");
  });
});

describe("leave_team", () => {
  let draftEvent: Row;
  let endedEvent: Row;
  let team: Row;
  let member: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("TEAMLEAVE1", "draft");
    endedEvent = await makeEvent("TEAMLEAVE2", "ended");
    team = await makeTeam(draftEvent.id, "Leave Test Team");
    member = await createPlayer("leave-team-member");
    const participant = await makeParticipant(draftEvent.id, member.profileId, "Member");
    await admin.from("participant").update({ team_id: team.id }).eq("id", participant.id);
  });

  it("returns the participant to solo play", async () => {
    const client = createUserClient(member.accessToken);
    const { error } = await client.rpc("leave_team", { p_event_id: draftEvent.id });
    expect(error).toBeNull();

    const participant = await admin
      .from("participant")
      .select("team_id")
      .eq("event_id", draftEvent.id)
      .eq("profile_id", member.profileId)
      .single();
    expect(participant.data?.team_id).toBeNull();
  });

  it("rejects leaving for a non-draft event", async () => {
    const endedMember = await createPlayer("leave-team-ended");
    await makeParticipant(endedEvent.id, endedMember.profileId, "EndedMember");
    const client = createUserClient(endedMember.accessToken);
    const { error } = await client.rpc("leave_team", { p_event_id: endedEvent.id });
    expect(error?.message).toBe("event_not_joinable");
  });
});

describe("rename_team", () => {
  let draftEvent: Row;
  let endedEvent: Row;
  let team: Row;
  let captain: TestUser;
  let nonCaptainMember: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("TEAMRENAME1", "draft");
    endedEvent = await makeEvent("TEAMRENAME2", "ended");
    captain = await createPlayer("rename-team-captain");
    nonCaptainMember = await createPlayer("rename-team-member");

    const captainParticipant = await makeParticipant(draftEvent.id, captain.profileId, "Captain");
    team = await makeTeam(draftEvent.id, "Rename Test Team", captainParticipant.id);
    await admin.from("participant").update({ team_id: team.id }).eq("id", captainParticipant.id);

    const memberParticipant = await makeParticipant(draftEvent.id, nonCaptainMember.profileId, "Member");
    await admin.from("participant").update({ team_id: team.id }).eq("id", memberParticipant.id);

    await makeTeam(draftEvent.id, "Taken Name Team");
  });

  it("lets the captain rename the team", async () => {
    const client = createUserClient(captain.accessToken);
    const { data, error } = await client.rpc("rename_team", {
      p_team_id: team.id,
      p_name: "Renamed Team",
    });
    expect(error).toBeNull();
    expect(data.team.name).toBe("Renamed Team");
  });

  it("rejects a non-captain member", async () => {
    const client = createUserClient(nonCaptainMember.accessToken);
    const { error } = await client.rpc("rename_team", {
      p_team_id: team.id,
      p_name: "Hijacked Name",
    });
    expect(error?.message).toBe("not_captain");
  });

  it("rejects a profane name", async () => {
    const client = createUserClient(captain.accessToken);
    const { error } = await client.rpc("rename_team", {
      p_team_id: team.id,
      p_name: "such a bullshit rename",
    });
    expect(error?.message).toBe("profanity");
  });

  it("rejects a duplicate (case-insensitive) name", async () => {
    const client = createUserClient(captain.accessToken);
    const { error } = await client.rpc("rename_team", {
      p_team_id: team.id,
      p_name: "taken name team",
    });
    expect(error?.message).toBe("name_taken");
  });

  it("rejects renaming for a non-draft event", async () => {
    const endedCaptainUser = await createPlayer("rename-team-ended-captain");
    const endedParticipant = await makeParticipant(endedEvent.id, endedCaptainUser.profileId, "EndedCaptain");
    const endedTeam = await makeTeam(endedEvent.id, "Ended Team", endedParticipant.id);
    const client = createUserClient(endedCaptainUser.accessToken);
    const { error } = await client.rpc("rename_team", {
      p_team_id: endedTeam.id,
      p_name: "New Name",
    });
    expect(error?.message).toBe("event_not_joinable");
  });
});

describe("direct writes bypassing the team RPCs are denied", () => {
  let draftEvent: Row;
  let team: Row;
  let participant: Row;
  let player: TestUser;

  beforeAll(async () => {
    draftEvent = await makeEvent("TEAMDIRECTWRITE", "draft");
    team = await makeTeam(draftEvent.id, "Direct Write Team");
    player = await createPlayer("direct-write-player");
    participant = await makeParticipant(draftEvent.id, player.profileId, "DirectWriter");
  });

  it("denies a direct update of participant.team_id", async () => {
    const client = createUserClient(player.accessToken);
    await client.from("participant").update({ team_id: team.id }).eq("id", participant.id);
    const after = await admin.from("participant").select("team_id").eq("id", participant.id).single();
    expect(after.data?.team_id).toBeNull();
  });

  it("denies a direct update of team.name", async () => {
    const client = createUserClient(player.accessToken);
    await client.from("team").update({ name: "Sneaky Rename" }).eq("id", team.id);
    const after = await admin.from("team").select("name").eq("id", team.id).single();
    expect(after.data?.name).toBe("Direct Write Team");
  });

  it("denies a direct update of team.captain_participant_id", async () => {
    const client = createUserClient(player.accessToken);
    await client.from("team").update({ captain_participant_id: participant.id }).eq("id", team.id);
    const after = await admin
      .from("team")
      .select("captain_participant_id")
      .eq("id", team.id)
      .single();
    expect(after.data?.captain_participant_id).toBeNull();
  });
});

describe("dissolution when an event goes live", () => {
  let event: Row;
  let soloTeam: Row;
  let duoTeam: Row;
  let soloMember: TestUser;
  let duoMemberA: TestUser;
  let duoMemberB: TestUser;

  beforeAll(async () => {
    event = await makeEvent("TEAMDISSOLVE", "draft");
    soloTeam = await makeTeam(event.id, "Solo Team");
    duoTeam = await makeTeam(event.id, "Duo Team");

    soloMember = await createPlayer("dissolve-solo");
    duoMemberA = await createPlayer("dissolve-duo-a");
    duoMemberB = await createPlayer("dissolve-duo-b");

    const soloParticipant = await makeParticipant(event.id, soloMember.profileId, "SoloMember");
    await admin.from("participant").update({ team_id: soloTeam.id }).eq("id", soloParticipant.id);

    const duoParticipantA = await makeParticipant(event.id, duoMemberA.profileId, "DuoMemberA");
    await admin.from("participant").update({ team_id: duoTeam.id }).eq("id", duoParticipantA.id);
    // duoMemberA is captain, so the "rejects rename" case below hits the
    // event-is-draft check rather than short-circuiting on not_captain.
    await admin.from("team").update({ captain_participant_id: duoParticipantA.id }).eq("id", duoTeam.id);
    const duoParticipantB = await makeParticipant(event.id, duoMemberB.profileId, "DuoMemberB");
    await admin.from("participant").update({ team_id: duoTeam.id }).eq("id", duoParticipantB.id);

    // Transitioning to live: only a service-role write can do this — the
    // admin RLS UPDATE policy's WITH CHECK requires status stay 'draft'
    // (design.md context), matching the pattern rls.test.ts already uses.
    const { error } = await admin.from("event").update({ status: "live" }).eq("id", event.id);
    if (error) throw new Error(`transition to live failed: ${error.message}`);
  });

  afterAll(async () => {
    // Only one `live` event may exist at a time — release the slot.
    await admin.from("event").delete().eq("id", event.id);
  });

  it("dissolves a single-member team and sets its member to solo", async () => {
    const teamAfter = await admin.from("team").select("dissolved").eq("id", soloTeam.id).single();
    expect(teamAfter.data?.dissolved).toBe(true);

    const participantAfter = await admin
      .from("participant")
      .select("team_id")
      .eq("event_id", event.id)
      .eq("profile_id", soloMember.profileId)
      .single();
    expect(participantAfter.data?.team_id).toBeNull();
  });

  it("leaves a two-or-more-member team unchanged", async () => {
    const teamAfter = await admin.from("team").select("dissolved").eq("id", duoTeam.id).single();
    expect(teamAfter.data?.dissolved).toBe(false);

    const participantAfter = await admin
      .from("participant")
      .select("team_id")
      .eq("event_id", event.id)
      .eq("profile_id", duoMemberA.profileId)
      .single();
    expect(participantAfter.data?.team_id).toBe(duoTeam.id);
  });

  it("rejects all four team RPCs once the event is live", async () => {
    const client = createUserClient(duoMemberA.accessToken);

    const create = await client.rpc("create_team", { p_event_id: event.id, p_name: "Too Late Team" });
    expect(create.error?.message).toBe("event_not_joinable");

    const join = await client.rpc("join_team", { p_team_id: duoTeam.id });
    expect(join.error?.message).toBe("event_not_joinable");

    const leave = await client.rpc("leave_team", { p_event_id: event.id });
    expect(leave.error?.message).toBe("event_not_joinable");

    const rename = await client.rpc("rename_team", { p_team_id: duoTeam.id, p_name: "Renamed Late" });
    expect(rename.error?.message).toBe("event_not_joinable");
  });
});
