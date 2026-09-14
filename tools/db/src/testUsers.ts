import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createAdminClient } from "./adminClient.js";

export interface TestUser {
  profileId: string;
  email: string;
  accessToken: string;
}

const TEST_PASSWORD = "test-password-do-not-use-in-prod";

/** Create a fresh player (non-admin) account and sign in, for RLS assertions / fixtures. */
export async function createPlayer(label = "player"): Promise<TestUser> {
  return createUser(label);
}

/** Create a fresh account and promote it to admin via `app_promote_admin`. */
export async function createAdmin(label = "admin"): Promise<TestUser> {
  const user = await createUser(label);
  const admin = createAdminClient();
  const { error } = await admin.rpc("app_promote_admin", { target_email: user.email });
  if (error) throw new Error(`app_promote_admin failed for ${user.email}: ${error.message}`);
  return user;
}

async function createUser(label: string): Promise<TestUser> {
  const admin = createAdminClient();
  const email = `${label}-${randomUUID()}@example.com`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`createUser(${email}) failed: ${createError?.message}`);
  }

  const { data: signedIn, error: signInError } = await admin.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError || !signedIn.session) {
    throw new Error(`signInWithPassword(${email}) failed: ${signInError?.message}`);
  }

  return {
    profileId: created.user.id,
    email,
    accessToken: signedIn.session.access_token,
  };
}

/**
 * A genuinely anonymous (guest) sign-in — distinct from `createPlayer()`,
 * which creates a real email+password account. Needed to test that
 * `season_score` excludes anonymous participants (`profile.is_anonymous`).
 */
export async function createAnonymousPlayer(): Promise<TestUser> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set — see tools/db/.env.example",
    );
  }
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || !data.session) {
    throw new Error(`signInAnonymously failed: ${error?.message}`);
  }
  return {
    profileId: data.user.id,
    email: "",
    accessToken: data.session.access_token,
  };
}

/** Best-effort cleanup — deletes the underlying auth user (cascades to `profile`). */
export async function deleteTestUser(profileId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(profileId);
}
