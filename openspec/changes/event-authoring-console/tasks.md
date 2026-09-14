## 1. Storage foundation

- [x] 1.1 Migration: create the `event-media` Storage bucket and its `storage.objects` policies (insert/update/delete gated by `public.is_admin()`, select public) per design.md D2; verify `supabase db reset` applies cleanly.
- [x] 1.2 `tools/db` test: non-admin (anon and authenticated player) upload to `event-media` is denied; admin upload succeeds; an uploaded object is readable by an unauthenticated request — verify `pnpm --filter @quiz/db test` passes.
- [x] 1.3 Add the `qrcode` dependency to `apps/web`; verify `pnpm install` and `pnpm --filter @quiz/web typecheck` succeed.

## 2. Admin auth and route guard

- [x] 2.1 Admin sign-in form (email/password only, no signup/anonymous affordance) using the existing Supabase Auth client — verify a component test covering successful sign-in and an invalid-credentials error.
- [x] 2.2 Admin route guard: redirect a signed-out visitor to sign-in; deny console content to a signed-in non-admin identity; render console content for an admin identity (reads `profile.is_admin` for the session) — verify a test for all three cases.
- [x] 2.3 Replace `AdminRoute.tsx`'s placeholder with the guarded console shell (sign-in + event list as its default view) — verify `apps/web/src/routes/routes.test.tsx` still passes and covers the new `/admin` entry point.

## 3. Draft event CRUD

- [x] 3.1 Event list view: shows the admin's events (draft and otherwise) — verify a test with a mocked list of events renders each with its title and status.
- [x] 3.2 Create-event form (title, language fr/en, venue label) that generates a join code with retry-on-conflict (design.md D6) and inserts a `draft` event — verify a test asserting the insert payload and that a generated join code is present.
- [x] 3.3 Edit-event form for an existing draft event's title/language/venue label — verify a test asserting the update payload.
- [x] 3.4 Delete a draft event, with a confirmation step — verify a test asserting the delete call and that the event leaves the list.

## 4. Step authoring

- [x] 4.1 Step list within the event editor: add a step, remove a step — verify a test asserting insert/delete calls and list updates.
- [x] 4.2 Reorder steps within a draft event — verify a test asserting the saved `position` values reflect the new order.

## 5. MCQ step configuration

- [x] 5.1 MCQ form: question text, add/remove/edit answer options, mark the correct option — verify a test covering option add/remove and correct-option selection, and that at least two options are required before save.
- [x] 5.2 Timer config: timed toggle + countdown-seconds field — verify a test asserting the saved `timed`/`countdown_seconds` values.
- [x] 5.3 Scoring config: points-for-correct (default 1) and team-award-points fields — verify a test asserting the saved `points_correct`/`team_award_points` values.

## 6. Join code and QR

- [x] 6.1 Display the event's join code and a QR code (via `qrcode`) encoding the player-route URL for that code — verify a test asserting the QR's encoded content resolves to `/e/<join_code>`.

## 7. Waiting-screen image

- [x] 7.1 Image upload control (image files only — reject other MIME types with a clear message) that re-encodes via canvas before upload (design.md D3) and stores the object under `event-media/<event_id>/...` via the Storage client, saving the reference to `event.waiting_media_path` — verify a test asserting a non-image file is rejected before upload, and that an accepted image is re-encoded (mocked canvas/toBlob) before the storage call.
- [x] 7.2 Countdown-target date/time field, saved to `event.waiting_countdown_target` — verify a test asserting the saved value.
- [x] 7.3 EXIF-strip verification — resolved as: jsdom has no real `<canvas>` 2D implementation, so a genuine fixture-image round-trip is only provable in a real browser (Playwright) or with a native re-encode dependency (`node-canvas`), both of which are new infra beyond this task's scope. User confirmed (see conversation): the metadata-stripping guarantee rests on documented browser-platform behavior (a canvas pixel buffer holds no source metadata — design.md D3), not on custom code, so there is nothing project-specific left to unit-test without that infra. Coverage is `imageUpload.test.ts` (task 7.1): non-image rejected before the canvas is touched, and the canvas API is invoked correctly with the accepted file.

## 8. Freeze-on-start guard

- [x] 8.1 Console renders event/step/MCQ content read-only (no edit controls) once `event.status` is not `draft` — verify a test rendering a non-draft event and asserting no edit control is present.
- [x] 8.2 A write attempted against a non-draft event (e.g. a stale tab) that is rejected by RLS surfaces the "can no longer be edited" message rather than a generic error — verify a test that mocks the RLS rejection and asserts the specific message renders.

## 9. Copy and localization

- [x] 9.1 French admin copy dictionary (mirrors `apps/web/src/routes/player/copy.ts`'s pattern, French-only — no `en` variant, per the admin-console-is-French-only convention) covering every string introduced above — verify no hardcoded French strings remain inline in the new components (spot-check via a grep of the new route files).

## 10. Verification and traceability

- [x] 10.1 Full workspace check green: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w build`, `pnpm -w test` (including a fresh local `supabase db reset` before the `tools/db` suite) — verify all pass.
- [x] 10.2 FR traceability table in this task's completion note, mapping FR-020 through FR-027 and FR-029 to the specific task(s)/test(s) that verify each; confirm no FR is unaddressed and the FR-025 video narrowing is recorded against FR-025's row.

  | FR | Requirement | Task(s) | Test(s) |
  |---|---|---|---|
  | FR-020 | Admin CRUD for events/steps while `draft` | 2.1–2.3, 3.1–3.4 | `AdminSignInForm.test.tsx`, `AdminGuard.test.tsx`, `EventListPage.test.tsx`, `EventDetailsForm.test.tsx` |
  | FR-021 | Event as ordered steps, one MCQ each | 4.1, 4.2 | `StepsList.test.tsx` |
  | FR-022 | MCQ config: question/options/correct/timed/countdown/points/team bonus | 5.1–5.3 | `McqForm.test.tsx` |
  | FR-023 | Event language fr/en | 3.2, 3.3 | `EventListPage.test.tsx` (create), `EventDetailsForm.test.tsx` (edit) — language selector exercised via those forms |
  | FR-024 | Generated join code + QR | 3.2 (code), 6.1 (QR) | `joinCode.test.ts`, `EventListPage.test.tsx`, `JoinCodeQr.test.tsx` |
  | FR-025 | Waiting-screen media + countdown target | 7.1, 7.2 | `imageUpload.test.ts`, `WaitingScreenForm.test.tsx` — **narrowed to images only this milestone**; video deferred to a follow-up change (design.md D4, user-confirmed) |
  | FR-026 | Freeze event/step content once no longer `draft` | 8.1, 8.2 | `EventEditorPage.test.tsx` (read-only rendering), `EventDetailsForm.test.tsx` (RLS-rejection message), `McqForm.test.tsx` (read-only) — the freeze itself is enforced by RLS from `data-model` (MILESTONE-02, already archived); this milestone adds only the UI guard |
  | FR-027 | At most one `live` event | — | Enforced by the `event_one_live_idx` partial unique index (MILESTONE-02, `tools/db/test/rls.test.ts`); this console never transitions an event to `live` (out of scope, see proposal.md), so there is no new console-level behavior to test |
  | FR-029 | Strip EXIF/metadata from uploaded media | 1.1, 1.2, 7.1, 7.3 | `eventMedia.test.ts` (storage access control), `imageUpload.test.ts` (re-encode code path); the metadata-stripping guarantee itself rests on browser canvas-export platform behavior (design.md D3), not custom code — see 7.3's resolution note for why no further unit test was added |

  Every FR named in tasks.md's scope (FR-020..FR-027, FR-029) is accounted for above; FR-028 (event-scoped record stamping) needed no new work, per proposal.md.

## 11. Close-out

- [x] 11.1 Update `README.md` if a new production step is introduced (e.g. confirming the `event-media` bucket exists after `supabase db push`, since bucket creation via migration should be verified once against the hosted project) — verify the doc change reads correctly. Resolved as: no new *manual* step — bucket creation flows through the existing `supabase db push` path like any other migration; added a one-line README clarification (under "Environments") so this isn't mistaken for a dashboard-only step the way the Auth toggles are.
- [ ] 11.2 Push the migration to production (`supabase db push`) after explicit owner confirmation — verify the bucket and its policies exist in the production project (e.g. via the Supabase dashboard or a scoped query), and record confirmation before merging.
