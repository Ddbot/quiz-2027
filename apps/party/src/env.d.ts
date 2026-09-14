// Worker secrets, set via `wrangler secret put` in production and
// `.dev.vars` locally (gitignored — see `.dev.vars.example`). Not declared
// under wrangler.jsonc's `[vars]`, so `wrangler types` only knows about them
// when a local `.dev.vars` is present (it then infers `string`, never
// optional, since a plain KEY=value file can't express "may be absent").
// In CI, no `.dev.vars` exists, so `wrangler types` omits these entirely and
// this file is the sole source for them — hence non-optional here too, to
// match either way without a declaration-merge conflict.
//
// Two separate types need augmenting: the bare global `Env` (used by
// `Server<Env>` in EventRoom.ts, and by wrangler's own generated bare
// `interface Env extends __BaseEnv_Env {}`) and `Cloudflare.Env` (what
// `cloudflare:test`'s `env` export — used in test/eventroom.test.ts — is
// typed against). Both are declared `extends __BaseEnv_Env {}` in the
// generated worker-configuration.d.ts, so both need these fields merged in
// the same way for either usage site to compile without `.dev.vars` present.
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

declare namespace Cloudflare {
  interface Env {
    readonly SENTRY_DSN: string;
    readonly SUPABASE_URL: string;
    readonly SUPABASE_SERVICE_ROLE_KEY: string;
    readonly SUPABASE_JWKS_URL: string;
  }
}
