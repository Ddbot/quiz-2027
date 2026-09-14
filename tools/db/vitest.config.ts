import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // RLS assertions hit a real local Supabase stack over HTTP; give them room.
    testTimeout: 15000,
    // Each test file's beforeAll seeds its own fixtures directly against the
    // one shared local Supabase stack (no per-file DB isolation) — running
    // files in parallel races them against each other. Keep files sequential.
    fileParallelism: false,
  },
});
