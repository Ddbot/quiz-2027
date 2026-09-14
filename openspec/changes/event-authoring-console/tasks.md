## 1. Storage foundation

- [ ] 1.1 Migration: create the `event-media` Storage bucket and its `storage.objects` policies (insert/update/delete gated by `public.is_admin()`, select public) per design.md D2; verify `supabase db reset` applies cleanly.
- [ ] 1.2 `tools/db` test: non-admin (anon and authenticated player) upload to `event-media` is denied; admin upload succeeds; an uploaded object is readable by an unauthenticated request — verify `pnpm --filter @quiz/db test` passes.
- [ ] 1.3 Add the `qrcode` dependency to `apps/web`; verify `pnpm install` and `pnpm --filter @quiz/web typecheck` succeed.

## 2. Admin auth and route guard

- [ ] 2.1 Admin sign-in form (email/password only, no signup/anonymous affordance) using the existing Supabase Auth client — verify a component test covering successful sign-in and an invalid-credentials error.
- [ ] 2.2 Admin route guard: redirect a signed-out visitor to sign-in; deny console content to a signed-in non-admin identity; render console content for an admin identity (reads `profile.is_admin` for the session) — verify a test for all three cases.
- [ ] 2.3 Replace `AdminRoute.tsx`'s placeholder with the guarded console shell (sign-in + event list as its default view) — verify `apps/web/src/routes/routes.test.tsx` still passes and covers the new `/admin` entry point.

## 3. Draft event CRUD

- [ ] 3.1 Event list view: shows the admin's events (draft and otherwise) — verify a test with a mocked list of events renders each with its title and status.
- [ ] 3.2 Create-event form (title, language fr/en, venue label) that generates a join code with retry-on-conflict (design.md D6) and inserts a `draft` event — verify a test asserting the insert payload and that a generated join code is present.
- [ ] 3.3 Edit-event form for an existing draft event's title/language/venue label — verify a test asserting the update payload.
- [ ] 3.4 Delete a draft event, with a confirmation step — verify a test asserting the delete call and that the event leaves the list.

## 4. Step authoring

- [ ] 4.1 Step list within the event editor: add a step, remove a step — verify a test asserting insert/delete calls and list updates.
- [ ] 4.2 Reorder steps within a draft event — verify a test asserting the saved `position` values reflect the new order.

## 5. MCQ step configuration

- [ ] 5.1 MCQ form: question text, add/remove/edit answer options, mark the correct option — verify a test covering option add/remove and correct-option selection, and that at least two options are required before save.
- [ ] 5.2 Timer config: timed toggle + countdown-seconds field — verify a test asserting the saved `timed`/`countdown_seconds` values.
- [ ] 5.3 Scoring config: points-for-correct (default 1) and team-award-points fields — verify a test asserting the saved `points_correct`/`team_award_points` values.

## 6. Join code and QR

- [ ] 6.1 Display the event's join code and a QR code (via `qrcode`) encoding the player-route URL for that code — verify a test asserting the QR's encoded content resolves to `/e/<join_code>`.

## 7. Waiting-screen image

- [ ] 7.1 Image upload control (image files only — reject other MIME types with a clear message) that re-encodes via canvas before upload (design.md D3) and stores the object under `event-media/<event_id>/...` via the Storage client, saving the reference to `event.waiting_media_path` — verify a test asserting a non-image file is rejected before upload, and that an accepted image is re-encoded (mocked canvas/toBlob) before the storage call.
- [ ] 7.2 Countdown-target date/time field, saved to `event.waiting_countdown_target` — verify a test asserting the saved value.
- [ ] 7.3 `tools/db` test: an uploaded fixture image round-tripped through the re-encode path carries no EXIF block — verify `pnpm --filter @quiz/db test` passes. *(If the re-encode step cannot run outside a browser canvas, cover this at the `apps/web` unit-test level instead with a fixture JPEG carrying EXIF and assert the re-encoded blob does not.)*

## 8. Freeze-on-start guard

- [ ] 8.1 Console renders event/step/MCQ content read-only (no edit controls) once `event.status` is not `draft` — verify a test rendering a non-draft event and asserting no edit control is present.
- [ ] 8.2 A write attempted against a non-draft event (e.g. a stale tab) that is rejected by RLS surfaces the "can no longer be edited" message rather than a generic error — verify a test that mocks the RLS rejection and asserts the specific message renders.

## 9. Copy and localization

- [ ] 9.1 French admin copy dictionary (mirrors `apps/web/src/routes/player/copy.ts`'s pattern, French-only — no `en` variant, per the admin-console-is-French-only convention) covering every string introduced above — verify no hardcoded French strings remain inline in the new components (spot-check via a grep of the new route files).

## 10. Verification and traceability

- [ ] 10.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (including a fresh local `supabase db reset` before the `tools/db` suite) — verify all pass.
- [ ] 10.2 FR traceability table in this task's completion note, mapping FR-020 through FR-027 and FR-029 to the specific task(s)/test(s) that verify each; confirm no FR is unaddressed and the FR-025 video narrowing is recorded against FR-025's row.

## 11. Close-out

- [ ] 11.1 Update `README.md` if a new production step is introduced (e.g. confirming the `event-media` bucket exists after `supabase db push`, since bucket creation via migration should be verified once against the hosted project) — verify the doc change reads correctly.
- [ ] 11.2 Push the migration to production (`supabase db push`) after explicit owner confirmation — verify the bucket and its policies exist in the production project (e.g. via the Supabase dashboard or a scoped query), and record confirmation before merging.
