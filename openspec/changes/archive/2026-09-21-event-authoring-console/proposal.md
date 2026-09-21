## Why

Right now the only way to get an event into the database is a hand-written SQL insert against production Postgres — there is no admin-facing way to create an event, add steps, configure MCQ content, generate a join code/QR, or attach waiting-screen media. MILESTONE-03 already built the player join flow and the RLS layer already locks event content to admins-while-draft, but nothing yet lets an admin actually author that content. SPEC.md §8 "MILESTONE-04: Event authoring console" is next in the milestone sequence and depends only on the already-archived MILESTONE-02 (data-model-rls).

## What Changes

- Replace the MILESTONE-01 placeholder `/admin` route with a real French-only admin console, reachable only to an authenticated identity whose `profile.is_admin = true`.
- Add admin sign-in (email/password against Supabase Auth). Admin accounts are pre-provisioned out-of-band (SQL) per the `data-model` capability — this change adds no admin signup path.
- Add draft event CRUD: create, list, edit, delete an event while `status = 'draft'` (title, language selector fr/en, venue label).
- Add ordered step CRUD within a draft event: add/remove/reorder steps, each step exactly one MCQ game (matches the existing `step`/`game_mcq` schema from `data-model`).
- Add an MCQ configuration form per step: question text, answer options, the correct option, timed/untimed toggle, countdown seconds, points for a correct answer (default 1), fixed points awarded to the step-winning team.
- Add system-generated join code + QR code generation per event; the QR encodes a URL that resolves to the existing player route (`/e/:code`, from `onboarding`) with the code pre-filled.
- Add waiting-screen media upload (optional image, this milestone) with EXIF/metadata stripped on ingest, plus an optional countdown-target date/time — backed by a new Supabase Storage bucket that does not exist yet. **Scope decision**: FR-025 describes "image or short video"; reliably stripping embedded metadata from a video container client-side (no server processing budget on the free tiers) needs a large new dependency (e.g. `ffmpeg.wasm`, ~30MB) out of step with this project's zero-cost/lightweight posture. Video upload is deferred to a follow-up change once a metadata-strip approach is chosen; this milestone accepts images only, stripped via a canvas re-encode.
- Add a freeze-on-start UI guard: once an event is no longer `draft`, the console disables edit affordances for that event and surfaces a clear message if a write is attempted; the actual freeze is already enforced by existing RLS (`data-model`'s "Event content is admin-authored and locked once the event leaves draft") — this change does not add new database constraints for that, it adds the storage-side equivalent (see Modified Capabilities) and the UI-side handling.

**Out of scope** (later milestones per SPEC.md §8): transitioning an event to `live`, MC/Operator live-control modes, team management, real-time gameplay, the analytics dashboard, participant moderation UI beyond what this CRUD needs.

## Capabilities

### New Capabilities
- `event-authoring`: the French admin console — sign-in, draft event CRUD, ordered MCQ step authoring, join code/QR generation, waiting-screen media upload, and the freeze-on-start UI guard.

### Modified Capabilities
- `data-model`: adds Storage-level access control for the new waiting-screen-media bucket (admin-only write, readable by the event's own participants and unauthenticated big-screen viewers before an event starts) and a requirement that uploaded media is stripped of EXIF/metadata on ingest — the same "admin-authored, EU-resident, access-controlled" posture this capability already holds for Postgres tables, extended to Storage.

## Impact

- `apps/web`: new `/admin` route tree (sign-in, event list, event editor, step editor, MCQ form, media upload, QR display) replacing `AdminRoute.tsx`'s placeholder; new French copy dictionary (mirrors the FR/EN pattern already used for the player flow, but admin is French-only).
- `supabase/migrations`: a new migration creating the Storage bucket and its access policies; no new Postgres tables (event/step/game_mcq already carry every field this milestone needs — join_code, waiting_media_path, waiting_countdown_target, timed, countdown_seconds, points_correct, team_award_points all already exist from MILESTONE-02).
- New dependency: a QR-code generation library and an EXIF-stripping approach for uploads (client-side strip before upload, or a Storage-triggered step — to be decided in design.md).
- No change to the real-time worker, the player onboarding flow, or existing RLS policies on Postgres tables.
