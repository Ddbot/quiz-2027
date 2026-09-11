import * as Sentry from "@sentry/react";

/**
 * Initialise Sentry for the browser app. No-op when `VITE_SENTRY_DSN` is unset
 * (local dev, tests, preview builds without the secret).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}
