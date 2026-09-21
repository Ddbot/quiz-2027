## Why

An account holder currently has no way to get their own data out or ask for their account to be deleted, and an anonymous guest's data never expires — both are basic GDPR obligations (FR-077..FR-079) this PoC hasn't met yet. MILESTONE-13 is the first milestone where its dependencies (season data already flowing since MILESTONE-10) are in place.

## What Changes

- A new `export_my_data` RPC: any authenticated identity gets their own profile, every participant row they hold, and every answer they submitted, as JSON.
- A new `delete_my_account` RPC: purges the caller's own profile fields (display name, email) and sets `deleted_at`, and rewrites their own participant rows' display names to a fixed anonymised placeholder — while their score rows stay intact and queryable, just no longer carrying any identifying information (see design.md D1 for why this purges the caller's own profile in place rather than literally repointing to a separately-fabricated "sentinel" profile, which the schema's own uniqueness constraint would make unsafe).
- A new scheduled Postgres job (`pg_cron`), running daily, that purges every anonymous participant's row — and, via existing cascading foreign keys, their answers and per-step/final scores with it — 90 days after the event they were part of ended. Account holders are never touched by this; only `profile.is_anonymous = true` participants.
- A new minimal account-management page (`/account`) for a signed-in account holder to trigger both of the above, linked from the root join-code landing page.

Already built, re-verified rather than re-implemented: season-year derivation and linking (FR-075, MILESTONE-07/10), the existing `season_score` view staying unexposed to any role (FR-076, MILESTONE-02), and consent storage on `profile` (MILESTONE-03).

## Capabilities

### New Capabilities
- `privacy`: the account holder's own data-export and account-deletion capability — the two RPCs and the page that exposes them.

### Modified Capabilities
- `data-model`: adds the 90-day anonymous-participant retention/purge requirement.

## Impact

- `supabase/migrations/`: one new migration (`export_my_data`, `delete_my_account`, the purge function, and its `pg_cron` schedule — no new tables/columns, everything it needs already exists).
- `apps/web/src/routes/`: new `AccountRoute.tsx` (or similar) + route registration; `JoinCodeLandingRoute.tsx` gains a conditional link for a signed-in account holder; new FR/EN copy.
- No changes to `apps/party` — this milestone is entirely Postgres + a new web page.
