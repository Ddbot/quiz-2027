import { randomUUID } from "node:crypto";

import { createAdminClient } from "./adminClient.js";
import { createAccountIdentity, createAnonymousIdentity, type Identity } from "./identities.js";

export interface StepFixture {
  id: string;
  position: number;
}

export interface Fixture {
  eventId: string;
  joinCode: string;
  steps: [StepFixture, StepFixture, StepFixture];
  /** P1–P9, keyed by label — P10 (the late joiner) is created later, in scenario.ts, once step 1 has been revealed. */
  identities: Record<string, Identity>;
  teamAlphaId: string;
  teamBetaId: string;
}

const CORRECT_OPTION = "a";
const OPTIONS = [
  { id: "a", label: "Option A" },
  { id: "b", label: "Option B" },
];

/**
 * Builds the event/steps (admin-authored, matching every other milestone's
 * fixture convention) and P1–P9's real identities/teams (design.md D3/D4).
 */
export async function buildFixture(): Promise<Fixture> {
  const admin = createAdminClient();

  const joinCode = `HRN${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
  const { data: event, error: eventError } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "PoC Validation Harness", language: "en", status: "draft" })
    .select()
    .single();
  if (eventError || !event) throw new Error(`event insert failed: ${eventError?.message}`);

  const steps = await Promise.all([
    createStep(admin, event.id, 1, { timed: false, countdownSeconds: 0, teamAwardPoints: 6 }),
    createStep(admin, event.id, 2, { timed: true, countdownSeconds: 5, teamAwardPoints: 6 }),
    createStep(admin, event.id, 3, { timed: false, countdownSeconds: 0, teamAwardPoints: 0 }),
  ]);

  // 6 anonymous + 4 account, distributed across both teams and solo so
  // neither grouping correlates with identity type (design.md D4).
  const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = await Promise.all([
    createAnonymousIdentity("p1"),
    createAccountIdentity("p2"),
    createAnonymousIdentity("p3"),
    createAccountIdentity("p4"),
    createAnonymousIdentity("p5"),
    createAccountIdentity("p6"),
    createAnonymousIdentity("p7"),
    createAnonymousIdentity("p8"),
    createAccountIdentity("p9"),
  ]);
  const identities = { p1, p2, p3, p4, p5, p6, p7, p8, p9 };

  for (const identity of Object.values(identities)) {
    const { error } = await identity.client.rpc("join_event", {
      p_join_code: joinCode,
      p_display_name: `Harness ${identity.label.toUpperCase()}`,
      p_over16_ack: true,
      p_marketing_consent: false,
    });
    if (error) throw new Error(`${identity.label}: join_event failed: ${error.message}`);
  }

  const teamAlphaId = await createTeam(p1, event.id, "Team Alpha", [p2, p3, p4]);
  const teamBetaId = await createTeam(p5, event.id, "Team Beta", [p6, p7]);
  // p8, p9 stay solo — no team RPC calls.

  return {
    eventId: event.id,
    joinCode,
    steps: steps as [StepFixture, StepFixture, StepFixture],
    identities,
    teamAlphaId,
    teamBetaId,
  };
}

async function createStep(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  position: number,
  options: { timed: boolean; countdownSeconds: number; teamAwardPoints: number },
): Promise<StepFixture> {
  const { data: step, error: stepError } = await admin
    .from("step")
    .insert({
      event_id: eventId,
      position,
      timed: options.timed,
      countdown_seconds: options.countdownSeconds,
      points_correct: 10,
      team_award_points: options.teamAwardPoints,
    })
    .select()
    .single();
  if (stepError || !step) throw new Error(`step ${position} insert failed: ${stepError?.message}`);

  const { error: mcqError } = await admin.from("game_mcq").insert({
    step_id: step.id,
    question_text: `Harness question for step ${position}`,
    options: OPTIONS,
    correct_option_id: CORRECT_OPTION,
  });
  if (mcqError) throw new Error(`step ${position} game_mcq insert failed: ${mcqError.message}`);

  return { id: step.id as string, position };
}

async function createTeam(captain: Identity, eventId: string, name: string, members: Identity[]): Promise<string> {
  const { data, error } = await captain.client.rpc("create_team", { p_event_id: eventId, p_name: name });
  if (error) throw new Error(`${captain.label}: create_team(${name}) failed: ${error.message}`);
  const teamId = data.team.id as string;

  for (const member of members) {
    const { error: joinError } = await member.client.rpc("join_team", { p_team_id: teamId });
    if (joinError) throw new Error(`${member.label}: join_team(${name}) failed: ${joinError.message}`);
  }

  return teamId;
}
