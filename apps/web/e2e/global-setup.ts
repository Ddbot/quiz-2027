import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Creates one throwaway draft event (no steps needed — the spec only goes
 * as far as the joined/team-lobby state) via the service-role client,
 * matching every other milestone's admin-authoring fixture convention. The
 * resulting join code is exported to `process.env.E2E_JOIN_CODE`, which
 * Playwright workers inherit since they fork after global setup completes.
 */
export default async function globalSetup(): Promise<void> {
  try {
    process.loadEnvFile(path.resolve(import.meta.dirname, "../.env.e2e"));
  } catch {
    // no .env.e2e file — assume the environment already has what we need
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY must be set — copy apps/web/.env.e2e.example to .env.e2e and fill it in",
    );
  }

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // 6 chars — the landing page's join-code input has maxLength={6} (FR-001).
  const joinCode = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  const { error } = await admin
    .from("event")
    .insert({ join_code: joinCode, title: "Playwright e2e happy path", language: "fr", status: "draft" });
  if (error) throw new Error(`e2e fixture event insert failed: ${error.message}`);

  process.env.E2E_JOIN_CODE = joinCode;
}
