import { createAdminClient } from "./adminClient.js";
import { WRANGLER_PORT } from "./env.js";
import { buildFixture } from "./fixture.js";
import type { Identity } from "./identities.js";
import { EXPECTED_INDIVIDUAL_TOTALS, EXPECTED_TEAM_TOTALS } from "./expected.js";
import { runScenario } from "./scenario.js";
import { startWranglerDev } from "./wrangler.js";

interface Failure {
  label: string;
  detail: string;
}

async function main(): Promise<void> {
  console.log("[harness] starting wrangler dev...");
  const wrangler = await startWranglerDev(WRANGLER_PORT);
  console.log(`[harness] wrangler dev ready on port ${wrangler.port}`);

  const failures: Failure[] = [];

  try {
    console.log("[harness] building fixture (event, steps, 9 identities, 2 teams)...");
    const fixture = await buildFixture();
    console.log(`[harness] fixture ready: event ${fixture.eventId}, join code ${fixture.joinCode}`);

    console.log("[harness] running scripted scenario over real partysocket connections...");
    const { timings, p10 } = await runScenario(wrangler.port, fixture);
    console.log("[harness] scenario complete. timings:");
    for (const t of timings) console.log(`  - ${t.label}: ${t.ms}ms`);

    const admin = createAdminClient();

    // Map every identity's profileId to its participant row for this event —
    // event_final_participant/event_final_team are keyed by participant_id/
    // team_id, not by the auth profile id.
    const allIdentities: Record<string, Identity> = { ...fixture.identities, p10 };
    const { data: participantRows, error: participantError } = await admin
      .from("participant")
      .select("id, profile_id")
      .eq("event_id", fixture.eventId);
    if (participantError || !participantRows) {
      throw new Error(`could not read participant roster: ${participantError?.message}`);
    }
    const participantIdByProfileId = new Map(
      participantRows.map((row) => [row.profile_id as string, row.id as string]),
    );
    const participantIdByLabel = new Map<string, string>();
    for (const [label, identity] of Object.entries(allIdentities)) {
      const participantId = participantIdByProfileId.get(identity.profileId);
      if (!participantId) {
        failures.push({ label, detail: `no participant row found for profileId ${identity.profileId}` });
        continue;
      }
      participantIdByLabel.set(label, participantId);
    }

    const { data: finalParticipants, error: finalParticipantsError } = await admin
      .from("event_final_participant")
      .select("participant_id, total_points, rank")
      .eq("event_id", fixture.eventId);
    if (finalParticipantsError || !finalParticipants) {
      throw new Error(`could not read event_final_participant: ${finalParticipantsError?.message}`);
    }
    const finalByParticipantId = new Map(
      finalParticipants.map((row) => [row.participant_id as string, row]),
    );

    for (const [label, expected] of Object.entries(EXPECTED_INDIVIDUAL_TOTALS)) {
      const participantId = participantIdByLabel.get(label);
      if (!participantId) continue; // already recorded above
      const actual = finalByParticipantId.get(participantId);
      if (!actual) {
        failures.push({ label, detail: "no event_final_participant row was recorded" });
        continue;
      }
      if (actual.total_points !== expected.total || actual.rank !== expected.rank) {
        failures.push({
          label,
          detail: `expected total=${expected.total} rank=${expected.rank}, got total=${actual.total_points} rank=${actual.rank}`,
        });
      }
    }

    const { data: finalTeams, error: finalTeamsError } = await admin
      .from("event_final_team")
      .select("team_id, total_awarded, rank")
      .eq("event_id", fixture.eventId);
    if (finalTeamsError || !finalTeams) {
      throw new Error(`could not read event_final_team: ${finalTeamsError?.message}`);
    }
    const finalByTeamId = new Map(finalTeams.map((row) => [row.team_id as string, row]));

    const teamIdByLabel: Record<string, string> = { alpha: fixture.teamAlphaId, beta: fixture.teamBetaId };
    for (const [label, expected] of Object.entries(EXPECTED_TEAM_TOTALS)) {
      const teamId = teamIdByLabel[label];
      const actual = teamId ? finalByTeamId.get(teamId) : undefined;
      if (!actual) {
        failures.push({ label: `team:${label}`, detail: "no event_final_team row was recorded" });
        continue;
      }
      if (actual.total_awarded !== expected.total || actual.rank !== expected.rank) {
        failures.push({
          label: `team:${label}`,
          detail: `expected total=${expected.total} rank=${expected.rank}, got total=${actual.total_awarded} rank=${actual.rank}`,
        });
      }
    }

    console.log(`[harness] participants: ${participantRows.length + 0} rows read (10 expected including p10)`);
    console.log(`[harness] event_final_participant: ${finalParticipants.length} rows, event_final_team: ${finalTeams.length} rows`);
  } catch (err) {
    failures.push({ label: "setup/scenario", detail: err instanceof Error ? err.message : String(err) });
  } finally {
    console.log("[harness] tearing down wrangler dev...");
    await wrangler.stop();
  }

  if (failures.length > 0) {
    console.error(`\n[harness] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f.label}: ${f.detail}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n[harness] PASSED — all hand-calculated individual and team totals matched exactly.");
}

main().catch((err) => {
  console.error("[harness] unhandled error:", err);
  process.exitCode = 1;
});
