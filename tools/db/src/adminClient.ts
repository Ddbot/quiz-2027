import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadLocalEnv } from "./env.js";

loadLocalEnv();

/**
 * Service-role client for local-only tooling (seeding, RLS test fixtures).
 * Bypasses RLS — never used against production. See tools/db/.env.example.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see tools/db/.env.example",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A client scoped to a specific user's access token, for RLS assertions. */
export function createUserClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set — see tools/db/.env.example",
    );
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * The anon key with no user session — PostgREST resolves this to the `anon`
 * Postgres role and `auth.uid()` is null. This is what "unauthenticated"
 * means in Supabase's model; there is no way to send literally no apikey.
 */
export function createAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set — see tools/db/.env.example",
    );
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
