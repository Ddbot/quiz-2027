import { createClient } from "@supabase/supabase-js";

/**
 * Singleton browser client. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` have
 * been provisioned (Vercel + local `.env.local`) since MILESTONE-01; this is
 * the first code to actually read them.
 */
function createSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see apps/web/.env.example",
    );
  }
  return createClient(url, anonKey);
}

export const supabase = createSupabaseClient();
