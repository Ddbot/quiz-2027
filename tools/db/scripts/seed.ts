// Local dev fixtures. Run after a reset: `supabase db reset && pnpm --filter db seed`.
// Needs auth.users rows (via the Admin API), which supabase/seed.sql can't create
// with plain SQL — see design.md D7.

import { createAdminClient } from "../src/adminClient.js";
import { createPlayer } from "../src/testUsers.js";

const admin = createAdminClient();

const { data: event, error: eventError } = await admin
  .from("event")
  .insert({
    join_code: "DEMO01",
    title: "Demo Event (local seed)",
    language: "fr",
    status: "draft",
  })
  .select()
  .single();
if (eventError) throw new Error(`seed: failed to create event: ${eventError.message}`);

const players = await Promise.all([createPlayer("seed-player"), createPlayer("seed-player")]);

for (const player of players) {
  const { error: participantError } = await admin.from("participant").insert({
    event_id: event.id,
    profile_id: player.profileId,
    display_name: player.email.split("-")[0],
  });
  if (participantError) {
    throw new Error(`seed: failed to create participant for ${player.email}: ${participantError.message}`);
  }
}

console.log(`Seeded event "${event.title}" (${event.join_code}) with ${players.length} participants.`);
