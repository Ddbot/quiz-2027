import path from "node:path";

/**
 * Best-effort local `.env` loader. In CI, `SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` are already set directly in the environment
 * (see .github/workflows/ci.yml), so a missing `.env` file here is fine —
 * this is for local dev only.
 */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(path.resolve(import.meta.dirname, "../.env"));
  } catch {
    // no .env file — assume the environment already has what we need
  }
}
