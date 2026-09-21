import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");

export interface WranglerHandle {
  port: string;
  stop(): Promise<void>;
}

/**
 * Spawns a real `wrangler dev` for apps/party (design.md D2 — this harness
 * needs a genuine listening server for the real `partysocket` client to
 * connect to, unlike apps/party's own in-process `@cloudflare/vitest-pool-workers`
 * suite). Resolves once wrangler's own "Ready on" log line appears, or
 * rejects on timeout/early exit.
 */
export async function startWranglerDev(port: string): Promise<WranglerHandle> {
  // `pnpm --filter party exec` from the repo root — same invocation shape
  // ci.yml already uses for `wrangler deploy` — resolves the local wrangler
  // binary correctly regardless of the caller's own cwd.
  const child = spawn("pnpm", ["--filter", "party", "exec", "wrangler", "dev", "--port", port], {
    cwd: REPO_ROOT,
    shell: true,
    // POSIX: run as its own process group leader so the whole tree
    // (wrangler -> workerd, etc.) can be killed together via a negative
    // pid (see killProcessTree below). No effect on win32.
    detached: process.platform !== "win32",
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("wrangler dev did not become ready within 60s")), 60_000);

    function onOutput(chunk: Buffer) {
      const text = chunk.toString();
      process.stdout.write(`[wrangler] ${text}`);
      if (text.includes("Ready on")) {
        clearTimeout(timeout);
        resolve();
      }
    }
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`wrangler dev exited early with code ${code}`));
      }
    });
  });

  return { port, stop: () => killProcessTree(child) };
}

/**
 * Kills the entire process tree, not just the top PID — reuses the exact
 * approach already proven manually during MILESTONE-14's close-out
 * (`taskkill /F /T` on Windows kills the whole descendant tree; on POSIX,
 * `detached: true` above made the child its own process-group leader, so
 * signalling the negative pid reaches every process in that group).
 */
async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)]).on("exit", () => resolve());
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // already dead
  }
}
