import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadLocalEnv, requireEnv } from "./env.js";

loadLocalEnv();

/** Service-role client — used only for admin authoring (event/steps/game_mcq), matching every other milestone's fixture convention. */
export function createAdminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon-key client — the real path every participant identity goes through (design.md D3). */
export function createAnonClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
