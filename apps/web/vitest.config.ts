import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Component tests mock `supabase-js` itself (see src/lib/supabase.test.ts
    // and route tests), but the client module still needs importable-looking
    // values to construct without throwing.
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      // A locally-set VITE_PARTY_HOST (apps/web/.env.local, gitignored) is
      // invisible to CI — without a fake value here, useEventRoom's connect
      // effect silently no-ops in CI (no PartySocket ever constructed) while
      // passing locally, since Vite/Vitest still picks up .env.local. Same
      // pattern as the two Supabase vars above.
      VITE_PARTY_HOST: "party.test.invalid",
    },
  },
});
