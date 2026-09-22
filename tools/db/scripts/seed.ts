// Local dev fixtures. Run after a reset: `supabase db reset && pnpm --filter db seed`.
// Needs auth.users rows (via the Admin API), which supabase/seed.sql can't create
// with plain SQL — see design.md D7.

import { createAdminClient } from "../src/adminClient.js";
import { createPlayer } from "../src/testUsers.js";

const admin = createAdminClient();

// A fixed-credential local-dev admin — deliberately memorable (unlike
// createAdmin()'s randomized test fixtures) so it can be used to sign in by
// hand in the browser. Local dev only; never used against production.
const DEV_ADMIN_EMAIL = "admin@test.com";
const DEV_ADMIN_PASSWORD = "00000000";

// Same idea, for a non-admin account — a memorable player login for manual
// testing of the join/team-lobby/live-play flow by hand.
const DEV_PLAYER_1_EMAIL = "player_1@test.com";
const DEV_PLAYER_2_EMAIL = "player_2@test.com";
const DEV_PLAYER_PASSWORD = "00000000";

const { data: existingUsers } = await admin.auth.admin.listUsers();
const existingEmails = new Set(existingUsers?.users.map((u) => u.email) ?? []);

if (!existingEmails.has(DEV_ADMIN_EMAIL)) {
  const { error: createDevAdminError } = await admin.auth.admin.createUser({
    email: DEV_ADMIN_EMAIL,
    password: DEV_ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (createDevAdminError) {
    throw new Error(`seed: failed to create dev admin: ${createDevAdminError.message}`);
  }
  const { error: promoteError } = await admin.rpc("app_promote_admin", { target_email: DEV_ADMIN_EMAIL });
  if (promoteError) {
    throw new Error(`seed: failed to promote dev admin: ${promoteError.message}`);
  }
  console.log(`Seeded dev admin ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`);
} else {
  console.log(`Dev admin ${DEV_ADMIN_EMAIL} already exists, skipping.`);
}

for (const email of [DEV_PLAYER_1_EMAIL, DEV_PLAYER_2_EMAIL]) {
  if (!existingEmails.has(email)) {
    const { error: createDevPlayerError } = await admin.auth.admin.createUser({
      email,
      password: DEV_PLAYER_PASSWORD,
      email_confirm: true,
    });
    if (createDevPlayerError) {
      throw new Error(`seed: failed to create dev player: ${createDevPlayerError.message}`);
    }
    console.log(`Seeded dev player ${email} / ${DEV_PLAYER_PASSWORD}`);
  } else {
    console.log(`Dev player ${email} already exists, skipping.`);
  }
}

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
