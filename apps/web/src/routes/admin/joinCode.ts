import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { AdminEvent } from "@/routes/admin/types";

// Excludes 0/O/1/I to avoid operator confusion when a join code is read aloud
// or typed manually (SPEC.md §4.1 — the code is also reachable by hand entry,
// not only via QR).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export interface CreateEventInput {
  title: string;
  language: "fr" | "en";
  venue_label: string | null;
}

/**
 * Inserts a new draft event, generating a join code client-side and retrying
 * on a unique-constraint collision (design.md D6). `event.join_code` has no
 * default generator — this is the sole place a join code is minted.
 */
export async function createDraftEvent(
  supabase: SupabaseClient,
  input: CreateEventInput,
): Promise<{ data: AdminEvent | null; error: PostgrestError | null }> {
  let lastError: PostgrestError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from("event")
      .insert({ ...input, join_code: generateJoinCode(), status: "draft" })
      .select()
      .single();

    if (!error) return { data: data as AdminEvent, error: null };
    if (error.code !== UNIQUE_VIOLATION) return { data: null, error };
    lastError = error;
  }

  return { data: null, error: lastError };
}
