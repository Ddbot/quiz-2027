import { withSentry } from "@sentry/cloudflare";
import { getServerByName, routePartykitRequest } from "partyserver";

import { EventRoom } from "./EventRoom";

export { EventRoom };

/**
 * Every per-event Durable Object is created through the EU jurisdiction so its
 * state stays in the European Union (platform-foundation residency requirement).
 */
const JURISDICTION = "eu" as const;

/** workerd (local dev, `vitest-pool-workers`) has no jurisdiction support. */
function isJurisdictionUnsupported(error: unknown): boolean {
  return error instanceof Error && /jurisdiction/i.test(error.message);
}

/**
 * Route a request to its EventRoom, pinning the object to the EU jurisdiction.
 *
 * Locally, workerd rejects `.jurisdiction()`, so we fall back to unpinned
 * routing to keep dev and tests working. On production that fallback would mean
 * the residency guarantee is not met — which is exactly what
 * `GET /__diag/jurisdiction` probes and reports for Q-001.
 */
async function routeToEventRoom(request: Request, env: Env): Promise<Response | null> {
  try {
    return await routePartykitRequest(request, env, { jurisdiction: JURISDICTION });
  } catch (error) {
    if (isJurisdictionUnsupported(error)) {
      return routePartykitRequest(request, env);
    }
    throw error;
  }
}

const handler = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // --- Temporary Q-001 diagnostics — removed in task 8.3 -------------------
    if (url.pathname === "/__diag/jurisdiction") {
      try {
        await getServerByName(env.EventRoom, "__diag", { jurisdiction: JURISDICTION });
        return Response.json({ ok: true });
      } catch (error) {
        return Response.json({ ok: false, error: String(error) }, { status: 500 });
      }
    }
    if (url.pathname === "/__diag/boom") {
      throw new Error("Intentional diagnostic error from /__diag/boom");
    }
    // --- end diagnostics ----------------------------------------------------

    const routed = await routeToEventRoom(request, env);
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export default withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    tracesSampleRate: 0,
  }),
  handler,
);
