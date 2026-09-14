-- event_media_storage — MILESTONE-04 (openspec/changes/event-authoring-console).
-- Adds the `event-media` Storage bucket for waiting-screen images. See
-- design.md D2: admin-only write, public read, one object per event
-- (overwritten on re-upload). No new Postgres tables — event/step/game_mcq
-- already carry every column this milestone needs (MILESTONE-02).

-- Public bucket: reads bypass RLS via the public object URL. Write access is
-- still governed by the storage.objects policies below regardless of this flag.
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by default on every Supabase
-- project; these policies scope to this bucket only and reuse the existing
-- `public.is_admin()` helper (same SECURITY DEFINER helper the Postgres-table
-- policies use — see the data_model migration's RLS-helpers section).
create policy "event-media admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-media' and public.is_admin());

create policy "event-media admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-media' and public.is_admin())
  with check (bucket_id = 'event-media' and public.is_admin());

create policy "event-media admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-media' and public.is_admin());

-- Explicit read policy in addition to the bucket's `public` flag, so a client
-- reading via the regular object-select API (not just the /object/public/
-- URL) also succeeds for anon and authenticated requests alike.
create policy "event-media public read"
  on storage.objects for select
  to public
  using (bucket_id = 'event-media');
