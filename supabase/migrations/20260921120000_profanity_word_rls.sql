-- profanity_word RLS fix — standalone security fix (found while scoping
-- gdpr-season-capture): the table created in
-- 20260914140924_join_event.sql never had RLS enabled and never had its
-- default anon/authenticated grants revoked, leaving it fully readable AND
-- writable (insert/update/delete/truncate) by anyone holding the public
-- anon key. The only legitimate reader is is_profane() (security definer,
-- owned by the migration role — RLS never applies to it), so nothing
-- legitimate needs direct table access at all.

revoke all on public.profanity_word from anon, authenticated;

alter table public.profanity_word enable row level security;
-- Deliberately no policies: is_profane() (security definer) is the only
-- legitimate access path and is unaffected by RLS as the table owner.
