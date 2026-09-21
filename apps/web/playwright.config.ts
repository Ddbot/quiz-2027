import { defineConfig } from "@playwright/test";

/**
 * Local/manual only (poc-validation-run design.md D1) — this is NOT wired
 * into `ci.yml`. Covers a meaningful slice of SPEC.md's G-2 happy path:
 * landing page -> enter join code -> anonymous join with consent -> confirm
 * the permanent name -> reach the joined/team-lobby state.
 *
 * How to run locally (see also e2e/README.md):
 *   1. `npx supabase start` (or a fresh `npx supabase db reset`) at the repo root.
 *   2. `pnpm --filter party exec wrangler dev` (apps/party, default port 8787).
 *   3. `pnpm --filter web dev` (Vite dev server, default port 5173).
 *   4. Copy `apps/web/.env.e2e.example` to `apps/web/.env.e2e` and fill in
 *      SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY from `npx supabase status`.
 *   5. `pnpm --filter web exec playwright install chromium` (once).
 *   6. `pnpm --filter web test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
