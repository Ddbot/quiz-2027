-- join_event — MILESTONE-03 (openspec/changes/auth-onboarding).
-- Profanity wordlist + is_profane() (design D2), join_event() RPC (design D1).

-- =============================================================================
-- 1. Profanity wordlist (task 1.1)
-- =============================================================================

create table public.profanity_word (
  word text primary key,
  language text not null check (language in ('fr', 'en'))
);

-- Starter FR+EN list (design D2, Risks: intentionally a starting point, not
-- exhaustive — FR-069 asks for "a wordlist filter", not a perfect classifier).
insert into public.profanity_word (word, language) values
  ('fuck', 'en'),
  ('shit', 'en'),
  ('bitch', 'en'),
  ('asshole', 'en'),
  ('bastard', 'en'),
  ('merde', 'fr'),
  ('putain', 'fr'),
  ('connard', 'fr'),
  ('salope', 'fr'),
  ('encule', 'fr');

-- Case-insensitive substring match — deliberately not whole-word-only, so
-- inflected/compound forms ("fucking", "bullshit") are still caught. Accepted
-- trade-off: a short wordlist entry could false-positive inside an unrelated
-- word: kept in mind when choosing entries above (see design D2 Risks).
create function public.is_profane(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profanity_word
    where candidate ilike ('%' || word || '%')
  );
$$;

-- `revoke ... from public` alone doesn't reach anon/authenticated's own
-- default-privilege grants (same gotcha hit with app_promote_admin in
-- MILESTONE-02) — revoke from anon by name too.
revoke all on function public.is_profane(text) from public, anon;
grant execute on function public.is_profane(text) to authenticated, service_role;

-- =============================================================================
-- 2. join_event (task 1.2) — the sole path for a non-admin to create a
-- `participant` row. See openspec/changes/auth-onboarding/specs/data-model/spec.md.
-- =============================================================================

create function public.join_event(p_join_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.event%rowtype;
  v_participant public.participant%rowtype;
begin
  if auth.uid() is null then
    raise exception 'join_event: authentication required' using errcode = '28000';
  end if;

  select * into v_event from public.event where join_code = p_join_code;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  -- draft and live are both joinable (SPEC.md REQ §4.4.2: late joiners are
  -- expected while live); only an ended event refuses new joins.
  if v_event.status = 'ended' then
    raise exception 'event_not_joinable' using errcode = 'P0001';
  end if;

  if public.is_profane(p_display_name) then
    raise exception 'profanity' using errcode = 'P0001';
  end if;

  select * into v_participant
    from public.participant
    where event_id = v_event.id and profile_id = auth.uid();

  if not found then
    insert into public.participant (event_id, profile_id, display_name)
    values (v_event.id, auth.uid(), p_display_name)
    returning * into v_participant;
  end if;

  return jsonb_build_object(
    'participant', jsonb_build_object(
      'id', v_participant.id,
      'event_id', v_participant.event_id,
      'profile_id', v_participant.profile_id,
      'display_name', v_participant.display_name,
      'joined_at', v_participant.joined_at
    ),
    'event', jsonb_build_object(
      'id', v_event.id,
      'join_code', v_event.join_code,
      'title', v_event.title,
      'language', v_event.language,
      'status', v_event.status
    )
  );
end;
$$;

-- anon (unauthenticated) is excluded; both anonymous *sign-in* and account
-- sessions carry role=authenticated in Supabase, so this covers both — see
-- design D1.
revoke all on function public.join_event(text, text) from public, anon;
grant execute on function public.join_event(text, text) to authenticated;

-- =============================================================================
-- 3. Public event summary (task 1.4, design D6)
-- =============================================================================

-- A prospective player has no session yet when resolving a join code
-- (SPEC.md §7.4.1: `GET /rest/v1/event?join_code=eq.{code}` is public).
-- `event`'s own RLS (data-model-rls) only allows admins/participants to read
-- it, so this view — deliberately WITHOUT security_invoker, so it runs as
-- its owner and reads past that RLS — exposes only the non-administrative
-- columns. No `created_by`, `waiting_media_path`, `waiting_countdown_target`,
-- or `current_step_id`.
create view public.event_public_summary as
select id, join_code, title, language, status, venue_label
from public.event;

grant select on public.event_public_summary to anon, authenticated;
