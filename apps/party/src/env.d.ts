// Worker secrets, set via `wrangler secret put` in production and
// `.dev.vars` locally (gitignored — see `.dev.vars.example`). Not declared
// under wrangler.jsonc's `[vars]`, so `wrangler types` only knows about them
// when a local `.dev.vars` is present (it then infers `string`, never
// optional, since a plain KEY=value file can't express "may be absent").
// In CI, no `.dev.vars` exists, so `wrangler types` omits these entirely and
// this file is the sole source for them — hence non-optional here too, to
// match either way without a declaration-merge conflict.
interface Env {
  /** Sentry DSN for the worker. Empty locally / in CI — Sentry then no-ops. */
  readonly SENTRY_DSN: string;
  /** Supabase project URL — used to resolve profile/participant on connect (MILESTONE-05). */
  readonly SUPABASE_URL: string;
  /** Supabase service-role key — worker-only secret, never shipped to the browser. */
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  /** Supabase JWKS endpoint for verifying user JWTs on WebSocket connect (MILESTONE-05). */
  readonly SUPABASE_JWKS_URL: string;
}
