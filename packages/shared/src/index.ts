// Public surface of @quiz/shared. This package MUST stay free of any web
// framework, Cloudflare/Workers runtime API, or hosting-provider SDK
// (enforced by eslint no-restricted-imports and scripts/check-shared-isolation.mjs).

export * from "./types.js";

/** Package identity marker, used by scaffold wiring tests. */
export const packageName = "@quiz/shared" as const;
