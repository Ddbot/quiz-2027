// Secrets are not declared in wrangler.jsonc, so `wrangler types` can't see
// them. Augment the generated Env with the worker's secret bindings here.
interface Env {
  /** Sentry DSN for the worker. Absent locally / in CI — Sentry then no-ops. */
  readonly SENTRY_DSN?: string;
  /** Supabase project URL (consumed by later milestones). */
  readonly SUPABASE_URL?: string;
  /** Supabase service-role key — worker-only secret, never shipped to the browser. */
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Supabase JWKS endpoint for verifying user JWTs (later milestones). */
  readonly SUPABASE_JWKS_URL?: string;
}
