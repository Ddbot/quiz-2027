#!/usr/bin/env node
// Fails if @quiz/shared has grown any runtime dependency. The package must stay
// platform-independent so game logic can move to another runtime (SPEC.md NFR-017).
import { execFileSync } from "node:child_process";

// On Windows the `pnpm` shim is a .cmd file, which Node >= 20 refuses to spawn
// without a shell; on POSIX the bare binary is spawned directly.
const isWindows = process.platform === "win32";

const raw = execFileSync("pnpm", ["list", "--filter", "@quiz/shared", "--depth", "0", "--json"], {
  encoding: "utf8",
  shell: isWindows,
});

const projects = JSON.parse(raw);
const deps = projects.flatMap((p) => Object.keys(p.dependencies ?? {}));

if (deps.length > 0) {
  console.error(`@quiz/shared must have zero runtime dependencies, found: ${deps.join(", ")}`);
  process.exit(1);
}

console.log("@quiz/shared has no runtime dependencies — OK");
