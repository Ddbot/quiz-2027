## Context

See proposal.md - Why/What Changes for motivation and scope. Relevant existing state:

- `event`, `step`, `game_mcq` already carry every column this console needs to write (`join_code`, `waiting_media_path`, `waiting_countdown_target`, `timed`, `countdown_seconds`, `points_correct`, `team_award_points`, etc. — see `supabase/migrations/20260914120108_data_model.sql`). No new Postgres tables are needed.
- RLS already enforces "admin-authored, locked once the event leaves draft" and "at most one live event" (`data-model` capability, already archived). This change's UI freeze guard is a convenience layer on top of an already-enforced server-side rule, not a new authorization boundary.
- `public.is_admin()` is an existing `SECURITY DEFINER` helper (checks `profile.is_admin` for `auth.uid()`), already used by every admin-gated Postgres RLS policy. Storage policies can call the same function.
- No Supabase Storage bucket exists yet (`supabase/config.toml` has no `[storage.buckets.*]` block).
- `apps/web` has no QR-code or image-processing dependency yet.
- `AdminRoute.tsx` is a MILESTONE-01 placeholder with no auth wiring; `apps/web/src/lib/supabase.ts` / `auth-context.ts` / `AuthProvider.tsx` already exist from MILESTONE-03 for the player flow and are reused as-is for admin sign-in (same Supabase Auth instance, same `useAuth()` hook — just a different sign-in method: email/password, no anonymous, no signup).

## Goals / Non-Goals

**Goals**: a usable admin console to author one event end-to-end (details, steps, MCQ content, join code/QR, waiting image) and stop editing once it leaves draft.

**Non-Goals**: rendering the waiting screen on the big screen (that's the `ScreenRoute` / later milestone's job — this change only stores the media reference); starting/transitioning an event to `live` (no such control is added); video upload (deferred, see below); any server-side image processing (Supabase Storage on the free tier has no transform pipeline available to this project — all processing is client-side before upload).

## Decisions

### D1: Admin sign-in reuses the existing Supabase Auth client, email/password only

No new auth infrastructure. The console adds a sign-in form (email + password, no "create account" affordance — admins are provisioned by SQL per `data-model`'s existing requirement) using the same `supabase.auth.signInWithPassword` call pattern MILESTONE-03 already uses for account-holder players. A route guard checks `useAuth()`'s session plus a `profile.is_admin` read (via a light `select is_admin from profile where id = auth.uid()` — safe under existing RLS, a profile row is always readable by its own owner) before rendering any console content; RLS is the actual enforcement boundary, the guard is UX only.

**Alternative considered**: a dedicated admin-only Supabase Auth "admin" role/claim. Rejected — `profile.is_admin` already exists and is exactly this; a second mechanism would be redundant and is explicitly the kind of "self-service admin path" the existing `data-model` requirement forbids widening.

### D2: Waiting-screen images go through a new `event-media` Storage bucket, admin-write / public-read, with a matching RLS-style storage policy

A new bucket `event-media` is created via migration. Storage policies (on `storage.objects` filtered to `bucket_id = 'event-media'`) mirror the Postgres pattern already established: `public.is_admin()` gates `insert`/`update`/`delete`; a permissive `select` policy allows unauthenticated reads (Supabase Storage's `anon` role), matching `event_public_summary`'s existing public-read posture. Object paths are namespaced `event-media/<event_id>/waiting.<ext>` so each event has exactly one current waiting image (a new upload for the same event overwrites the previous object rather than accumulating orphans).

**Alternative considered**: signed URLs instead of a public-read bucket. Rejected — the waiting image is meant for public display (the big screen, and potentially the join page); it carries no PII once EXIF-stripped, so there is no confidentiality need, and signed URLs would add expiry-management complexity for no benefit.

### D3: EXIF/metadata stripping happens client-side via canvas re-encode, before upload

The browser draws the selected image onto an off-screen `<canvas>` and re-exports it (`canvas.toBlob`) as PNG or JPEG; canvas export never carries over the source file's embedded metadata (EXIF, XMP, ICC beyond basic color, GPS), because the canvas pixel buffer holds no such data to begin with. This needs no new dependency. The re-encoded blob (not the original `File`) is what gets uploaded to `event-media`.

**Alternative considered**: a dedicated EXIF-stripping library (`piexifjs`, etc.). Rejected as unnecessary — those libraries edit metadata in place, which still requires trusting the library to strip everything; a full re-encode is a strictly stronger guarantee and needs zero new dependencies.

### D4: Video upload is deferred to a follow-up change (user-confirmed scope decision)

FR-025 names "image or short video." Video containers (MP4/MOV) carry metadata in box/atom structures a canvas re-encode cannot touch, and reliably stripping them client-side (no server compute budget on the free tiers) needs a large dependency such as `ffmpeg.wasm` (~30MB), which conflicts with this project's zero-cost/lightweight posture and this milestone's effort budget. This milestone's upload control only accepts images; the spec (`event-authoring` and `data-model` deltas) reflects that. Video support is left for a dedicated follow-up change once a metadata-strip approach is chosen.

### D5: QR code generation uses the `qrcode` npm package, rendered as SVG

`qrcode` (MIT, dependency-free, well-established) generates a QR from the join URL (`<player-app-origin>/e/<join_code>`) client-side, rendered as an inline SVG (crisp at any size, no canvas/image asset to manage, easy to keep accessible with a text fallback showing the raw code).

**Alternative considered**: server-generated QR (a Postgres function or edge function returning an image). Rejected — no server-side image generation exists in this stack (no edge functions provisioned), and client-side SVG generation is simpler and has no data-residency implication (the join code is not secret; the whole `event_public_summary` view already exposes it in the clear from MILESTONE-03).

### D6: Join codes are generated client-side, with retry-on-conflict

`event.join_code` is already `unique not null` with no default generator (MILESTONE-02). On event creation, the console generates a short random code (uppercase alphanumeric, collision-resistant length) and inserts it; on a unique-constraint violation it regenerates and retries a small, bounded number of times before surfacing an error. This mirrors the existing test fixtures' code shape (e.g. `RLSA01`) without adding a new Postgres function — a client-generated code with retry-on-conflict is simple and the collision probability at this project's scale (a handful of events, ever) is negligible even before the retry loop is considered.

**Alternative considered**: a `SECURITY DEFINER` Postgres function that generates and reserves a code server-side (loop-until-unique inside a transaction). Rejected as unneeded complexity for the expected event volume — noted here in case a future milestone's event volume changes that calculus.

### D7: The freeze-on-start UI guard reads `event.status` and mirrors — never re-derives — the RLS rule

The console never re-implements a "can this be edited" boolean by its own inference (e.g. checking dates/timers) — it directly reads the event's `status` column (already fetched to render the console) and treats anything other than `'draft'` as read-only, exactly matching the RLS predicate (`public.event_is_draft(event_id)`) that already exists. If a stale client nonetheless attempts a write after another process moves the event out of draft (race), the resulting Postgres error is caught and surfaced as the "can no longer be edited" message rather than a generic failure — this is a UX affordance on top of RLS, which remains the actual authorization boundary.

## Risks / Trade-offs

- [Risk] Video waiting-screen media is not supported this milestone, narrower than FR-025's literal text → Mitigation: explicitly scoped down with the user's confirmation (see D4), recorded here and in the delta specs; tracked as a follow-up change rather than silently dropped.
- [Risk] A public-read Storage bucket means anyone with an object path can fetch a waiting image without needing the join code → Mitigation: acceptable — the image itself is meant to be shown publicly on a big screen; paths are unguessable UUIDs, and no PII survives the EXIF strip in D3.
- [Risk] Canvas re-encode changes the original file's pixel format/compression (e.g. re-compresses a JPEG), which is a lossy transform → Mitigation: acceptable trade-off for a stripped-metadata guarantee; images are for a waiting screen, not archival quality.

## Migration Plan

1. New Supabase migration: create the `event-media` Storage bucket and its RLS-style storage policies (admin-only write, public read), following the same `SECURITY DEFINER`/explicit-revoke pattern already used for `is_admin()` and `join_event`.
2. No Postgres table changes — `event`/`step`/`game_mcq` already have every column needed.
3. `apps/web`: new `/admin/*` route tree replacing the `AdminRoute.tsx` placeholder; new dependency `qrcode`.
4. Deploy through the existing pipeline (Vercel Git integration for the web app, `supabase db push` for the migration, same production confirmation gate used in prior milestones).
5. Rollback: the new route tree and migration are additive (new bucket, new policies, no altered/dropped columns) — a revert is a straightforward `git revert` plus dropping the new bucket/policies if ever needed; no data migration to unwind.

## Open Questions

None — the one material ambiguity (video scope) was resolved with the user before writing tasks (see D4).
