/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Host (and optional scheme) of the PartyServer worker, e.g. `localhost:1999` or `party.example.workers.dev`. */
  readonly VITE_PARTY_HOST?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
