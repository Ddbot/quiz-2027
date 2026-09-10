import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// @cloudflare/vitest-pool-workers >= 0.22 (Vitest 4): the Workers runtime is
// wired in as a Vite plugin instead of `poolOptions.workers`.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
