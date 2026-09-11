import { withSentry } from "@sentry/cloudflare";
import { routePartykitRequest } from "partyserver";

import { EventRoom } from "./EventRoom";

export { EventRoom };

/**
 * Every per-event Durable Object is created through the EU jurisdiction so its
 * state stays in the European Union (platform-foundation residency requirement).
 * Confirmed available on the Workers Free plan (SPEC.md Q-001, resolved).
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
 * routing to keep dev and tests working. On the deployed worker jurisdiction
 * pinning succeeds (verified — Q-001).
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
