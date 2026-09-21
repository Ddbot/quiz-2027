import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "./adminClient.js";
import { requireEnv } from "./env.js";

export interface Identity {
  label: string;
  profileId: string;
  /** Set only for account identities (createAccountIdentity/createAdminIdentity) — anonymous identities have no email. */
  email?: string;
  accessToken: string;
  /** A client authenticated as this identity — the real, anon-key-scoped path every RPC call below goes through. */
  client: SupabaseClient;
}

const TEST_PASSWORD = "harness-password-do-not-use-in-prod";

/**
 * A real anonymous sign-in — the same call `apps/web`'s own `signInAnonymously`
 * action makes, through the anon-key client (design.md D3).
 */
export async function createAnonymousIdentity(label: string): Promise<Identity> {
  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || !data.session) throw new Error(`${label}: signInAnonymously failed: ${error?.message}`);
  return { label, profileId: data.user.id, accessToken: data.session.access_token, client };
}

/**
 * An account identity, pre-confirmed via the Admin API (the same shortcut
 * `tools/db`'s own `createPlayer` already uses) rather than a real
 * signup+Mailpit-confirmation-link round trip — email confirmation itself
 * is already thoroughly covered by tools/db/test/emailConfirmation.test.ts;
 * this harness's job is the event/scoring flow, not re-proving that. Once
 * signed in, every RPC call still goes through the same anon-key,
 * real-session client every other identity uses (design.md D3).
 */
/** The MC/admin identity — an account identity promoted via `app_promote_admin`, matching every other milestone's admin-test-fixture convention. */
export async function createAdminIdentity(label: string): Promise<Identity> {
  const identity = await createAccountIdentity(label);
  const admin = createAdminClient();
  const { error } = await admin.rpc("app_promote_admin", { target_email: identity.email });
  if (error) throw new Error(`${label}: app_promote_admin failed: ${error.message}`);
  return identity;
}

export async function createAccountIdentity(label: string): Promise<Identity> {
  const admin = createAdminClient();
  const email = `harness-${label}-${randomUUID()}@example.com`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`${label}: createUser failed: ${createError?.message}`);

  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError || !signedIn.session) throw new Error(`${label}: signIn failed: ${signInError?.message}`);
  return { label, profileId: created.user.id, email, accessToken: signedIn.session.access_token, client };
}
