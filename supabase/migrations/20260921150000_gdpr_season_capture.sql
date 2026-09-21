-- gdpr-season-capture — MILESTONE-13.
-- export_my_data/delete_my_account (design D1), the 90-day anonymous purge
-- + its pg_cron schedule (design D2/D3). See
-- openspec/changes/gdpr-season-capture/design.md.

-- =============================================================================
-- 1. export_my_data (task 1.1, FR-077) — any authenticated identity gets
-- their own profile + participants + answers, and nothing else.
-- =============================================================================

create function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profile%rowtype;
begin
  if auth.uid() is null then
    raise exception 'export_my_data: authentication required' using errcode = '28000';
  end if;

  select * into v_profile from public.profile where id = auth.uid();

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'email', v_profile.email,
      'is_anonymous', v_profile.is_anonymous,
      'over16_ack', v_profile.over16_ack,
      'tos_accepted_at', v_profile.tos_accepted_at,
      'marketing_consent', v_profile.marketing_consent,
      'created_at', v_profile.created_at
    ),
    'participants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'event_id', p.event_id,
        'display_name', p.display_name,
        'team_id', p.team_id,
        'joined_at', p.joined_at
      )), '[]'::jsonb)
      from public.participant p
      where p.profile_id = auth.uid()
    ),
    'answers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_id', a.step_id,
        'option_id', a.option_id,
        'submitted_at', a.submitted_at,
        'is_correct', a.is_correct,
        'scored_points', a.scored_points
      )), '[]'::jsonb)
      from public.answer a
      join public.participant p on p.id = a.participant_id
      where p.profile_id = auth.uid()
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- =============================================================================
-- 2. delete_my_account (task 1.2, FR-078, design D1) — purges the caller's
-- own identifying profile fields in place (display_name/email, deleted_at)
-- rather than repointing participant.profile_id to a fabricated "sentinel"
-- profile: participant's own `unique (event_id, profile_id)` constraint
-- would collide the moment two different deleted accounts had both played
-- the same event against one shared sentinel, and creating a fresh sentinel
-- per deletion would need a new auth.users row (Admin API, not plain SQL).
-- Purging the original profile row in place reaches the same substantive
-- outcome — score rows survive, nothing about them points at any remaining
-- identifying information — with no such risk. Consent fields
-- (over16_ack/tos_accepted_at/marketing_consent) are deliberately left
-- alone: they carry no PII and are evidence consent was properly collected,
-- not identity to purge. Idempotent — a repeat call is a harmless no-op on
-- fields already cleared, and `deleted_at` never gets bumped forward.
-- =============================================================================

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'delete_my_account: authentication required' using errcode = '28000';
  end if;

  update public.profile
    set display_name = null,
        email = null,
        deleted_at = coalesce(deleted_at, now())
    where id = auth.uid();

  update public.participant
    set display_name = 'Compte supprimé'
    where profile_id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =============================================================================
-- 3. purge_expired_anonymous_participants (task 1.3, FR-079, design D3) —
-- hard-deletes (not anonymises) every anonymous participant of an event
-- that ended over 90 days ago. answer/step_result_participant/
-- event_final_participant cascade away for free via their existing FKs.
-- team.captain_participant_id has no ON DELETE clause (defaults to
-- RESTRICT), so any affected captaincy is cleared first. Granted to no
-- client-facing role at all — only the pg_cron schedule below calls it.
-- =============================================================================

create function public.purge_expired_anonymous_participants()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purged_count int;
begin
  update public.team t
    set captain_participant_id = null
    where captain_participant_id in (
      select p.id
      from public.participant p
      join public.profile pr on pr.id = p.profile_id
      join public.event e on e.id = p.event_id
      where pr.is_anonymous = true
        and e.ended_at is not null
        and e.ended_at < now() - interval '90 days'
    );

  with purged as (
    delete from public.participant p
    using public.profile pr, public.event e
    where p.profile_id = pr.id
      and p.event_id = e.id
      and pr.is_anonymous = true
      and e.ended_at is not null
      and e.ended_at < now() - interval '90 days'
    returning p.id
  )
  select count(*) into v_purged_count from purged;

  return v_purged_count;
end;
$$;

revoke all on function public.purge_expired_anonymous_participants() from public, anon, authenticated;

-- =============================================================================
-- 4. pg_cron schedule (task 1.4, design D2) — runs entirely inside Postgres,
-- no API key of any kind needed (unlike a GitHub-Actions-cron alternative,
-- which would need the service-role key as a second secret store — that key
-- is held only as a Cloudflare Worker secret today). cron.schedule() with an
-- existing job_name updates it in place, so this is safe to re-run.
-- =============================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-anonymous-participants',
  '0 3 * * *',
  $$select public.purge_expired_anonymous_participants();$$
);
