## Why

MILESTONE-02 gave the system a schema and RLS, but deliberately no way for a player to create their own `participant` row — `join_event` was always meant to be the controlled path (SPEC.md §7.4.1), not a raw RLS insert policy. Right now `/e/:joinCode` is still MILESTONE-01's placeholder shell. Nobody can actually join an event. This change builds the real player-facing onboarding flow: choose anonymous or an account, the age/consent gate, the permanent-display-name warning, and the idempotent join itself.

## What Changes

- Wire `@supabase/supabase-js` into `apps/web` for the first time (env vars already exist from MILESTONE-01; no client has used them yet).
- Replace `/e/:joinCode`'s placeholder with the real flow: resolve the join code to an event (or show an error), let the player choose **anonymous** (display name only) or **account** (email + password + display name), require the "I am over 16" checkbox and Terms/Privacy acceptance before either path proceeds, offer marketing consent as a separate unticked optional checkbox, show a permanent-name warning screen requiring explicit confirmation before the name is saved, then call `join_event`.
- Add a `join_event(join_code, display_name)` Postgres RPC (`SECURITY DEFINER`) to the data model: validates the code, checks the display name against a French+English profanity wordlist, creates (or idempotently returns) the caller's `participant` row for that event. This is the only path a player has to create a `participant` row — RLS still has no direct insert policy for it.
- Enable Supabase email confirmations (`enable_confirmations`, currently off) so account creation requires verifying the email address before the session is usable, per FR-003. Anonymous sign-in is unaffected — it stays instant.
- Add placeholder Terms of Service / Privacy Policy pages for the acceptance checkbox to link to. Real legal drafting is explicitly out of scope for the PoC (REQUIREMENTS.md §5.4, §11 A-5) — these are stand-ins, not final legal text.
- Record `over16_ack`, `tos_accepted_at`, `marketing_consent` on `profile` at join time (columns already exist from MILESTONE-02; nothing currently writes them).

## Capabilities

### New Capabilities

- `onboarding`: the player-facing identity and consent flow — choosing anonymous or account identity, the age/ToS/marketing-consent gate, the permanent-name warning, and joining an event. Owns everything from "player opens `/e/:joinCode`" up to "player has a `participant` row and can proceed to the lobby" (team lobby itself is a later milestone).

### Modified Capabilities

- `data-model`: adds the `join_event` RPC as the sole path for a player to create their own `participant` row (idempotent, profanity-checked, validates the join code and that the event is joinable).
- `platform-foundation`: the "Placeholder application routes load on target browsers" requirement no longer holds for the player route — it now implements the real onboarding flow instead of a placeholder shell. The admin and big-screen routes are unaffected (still placeholders, pending their own milestones).

## Impact

- **New:** `join_event` RPC + profanity-wordlist support in a new migration; onboarding UI in `apps/web` (routes, forms, Supabase Auth wiring); placeholder ToS/Privacy pages; an extension to `tools/db`'s test suite covering `join_event`.
- **Changed:** `supabase/config.toml` (`enable_confirmations = true`); `apps/web`'s player route and its tests; the secrets matrix is unaffected (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` already provisioned, just unused until now).
- **Out of scope (later milestones per `SPEC.md` §8):** team creation/joining (FR-012+, MILESTONE-04+), the admin console (MILESTONE-04), duplicate-display-name admin/scoring disambiguation (FR-010 — nothing to disambiguate against yet), image/photo upload (explicitly out of scope for the PoC per `SPEC.md` §7.3 comments).
- **Dependencies:** MILESTONE-02 (`data-model`, `platform-foundation`), already complete.
