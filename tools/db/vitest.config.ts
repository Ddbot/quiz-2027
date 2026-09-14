import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // RLS assertions hit a real local Supabase stack over HTTP; give them room.
    testTimeout: 15000,
  },
});
