import path from "node:path";

/**
 * Best-effort local `.env` loader (mirrors tools/db/src/env.ts). In CI,
 * `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are already
 * set directly in the job environment (see .github/workflows/ci.yml), so a
 * missing `.env` file here is fine — this is for local dev only.
 */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(path.resolve(import.meta.dirname, "../.env"));
  } catch {
    // no .env file — assume the environment already has what we need
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set — see tools/harness/.env.example`);
  return value;
}

/** apps/party's own default (8787) is deliberately avoided — see .env.example. */
export const WRANGLER_PORT = process.env.WRANGLER_PORT ?? "8799";
