-- team_lobby — MILESTONE-06 (openspec/changes/team-lobby).
-- Four SECURITY DEFINER RPCs (create_team/join_team/leave_team/rename_team),
-- mirroring join_event's pattern exactly (see design.md D1), plus a
-- dissolution trigger firing when an event goes live (design.md D3). No new
-- tables — team/participant already carry everything needed (MILESTONE-02).

-- =============================================================================
-- 1. Team RPCs
-- =============================================================================

create function public.create_team(p_event_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.participant%rowtype;
  v_team public.team%rowtype;
begin
  if auth.uid() is null then
    raise exception 'create_team: authentication required' using errcode = '28000';
  end if;

  select * into v_participant from public.participant
    where event_id = p_event_id and profile_id = auth.uid();
  if not found then
    raise exception 'not_a_participant' using errcode = 'P0001';
  end if;

  if not public.event_is_draft(p_event_id) then
    raise exception 'event_not_joinable' using errcode = 'P0001';
  end if;

  if public.is_profane(p_name) then
    raise exception 'profanity' using errcode = 'P0001';
  end if;

  begin
    insert into public.team (event_id, name, captain_participant_id)
      values (p_event_id, p_name, v_participant.id)
      returning * into v_team;
  exception when unique_violation then
    raise exception 'name_taken' using errcode = 'P0001';
  end;

  update public.participant set team_id = v_team.id where id = v_participant.id;

  return jsonb_build_object('team', jsonb_build_object(
    'id', v_team.id,
    'event_id', v_team.event_id,
    'name', v_team.name,
    'captain_participant_id', v_team.captain_participant_id
  ));
end;
$$;

create function public.join_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.team%rowtype;
  v_participant public.participant%rowtype;
begin
  if auth.uid() is null then
    raise exception 'join_team: authentication required' using errcode = '28000';
  end if;

  select * into v_team from public.team where id = p_team_id;
  if not found then
    raise exception 'invalid_team' using errcode = 'P0001';
  end if;
  if v_team.dissolved then
    raise exception 'team_dissolved' using errcode = 'P0001';
  end if;

  select * into v_participant from public.participant
    where event_id = v_team.event_id and profile_id = auth.uid();
  if not found then
    raise exception 'not_a_participant' using errcode = 'P0001';
  end if;

  if not public.event_is_draft(v_team.event_id) then
    raise exception 'event_not_joinable' using errcode = 'P0001';
  end if;

  update public.participant set team_id = v_team.id where id = v_participant.id;

  return jsonb_build_object('participant', jsonb_build_object(
    'id', v_participant.id,
    'team_id', v_team.id
  ));
end;
$$;

-- No parameters in SPEC.md's literal contract, but that's ambiguous when a
-- profile holds participant rows in more than one still-draft event — an
-- explicit p_event_id anchors it unambiguously, same as p_team_id does for
-- join_team/rename_team (design.md D2).
create function public.leave_team(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.participant%rowtype;
begin
  if auth.uid() is null then
    raise exception 'leave_team: authentication required' using errcode = '28000';
  end if;

  select * into v_participant from public.participant
    where event_id = p_event_id and profile_id = auth.uid();
  if not found then
    raise exception 'not_a_participant' using errcode = 'P0001';
  end if;

  if not public.event_is_draft(p_event_id) then
    raise exception 'event_not_joinable' using errcode = 'P0001';
  end if;

  update public.participant set team_id = null where id = v_participant.id;

  return jsonb_build_object('participant', jsonb_build_object(
    'id', v_participant.id,
    'team_id', null
  ));
end;
$$;

create function public.rename_team(p_team_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.team%rowtype;
  v_participant public.participant%rowtype;
begin
  if auth.uid() is null then
    raise exception 'rename_team: authentication required' using errcode = '28000';
  end if;

  select * into v_team from public.team where id = p_team_id;
  if not found then
    raise exception 'invalid_team' using errcode = 'P0001';
  end if;

  select * into v_participant from public.participant
    where id = v_team.captain_participant_id and profile_id = auth.uid();
  if not found then
    raise exception 'not_captain' using errcode = 'P0001';
  end if;

  if not public.event_is_draft(v_team.event_id) then
    raise exception 'event_not_joinable' using errcode = 'P0001';
  end if;

  if public.is_profane(p_name) then
    raise exception 'profanity' using errcode = 'P0001';
  end if;

  begin
    update public.team set name = p_name where id = p_team_id;
  exception when unique_violation then
    raise exception 'name_taken' using errcode = 'P0001';
  end;

  return jsonb_build_object('team', jsonb_build_object(
    'id', p_team_id,
    'name', p_name
  ));
end;
$$;

-- Same gotcha as is_profane/join_event: `revoke ... from public` alone
-- doesn't reach anon/authenticated's own default-privilege grants. Supabase
-- sessions (anonymous or account) carry role = authenticated.
revoke all on function public.create_team(uuid, text) from public, anon;
grant execute on function public.create_team(uuid, text) to authenticated;

revoke all on function public.join_team(uuid) from public, anon;
grant execute on function public.join_team(uuid) to authenticated;

revoke all on function public.leave_team(uuid) from public, anon;
grant execute on function public.leave_team(uuid) to authenticated;

revoke all on function public.rename_team(uuid, text) from public, anon;
grant execute on function public.rename_team(uuid, text) to authenticated;

-- =============================================================================
-- 2. Dissolution trigger (design.md D3)
-- =============================================================================

create function public.dissolve_undersized_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_small_team_ids uuid[];
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    -- Snapshot undersized teams *before* mutating either table — computing
    -- size again after nulling members would undercount.
    select array_agg(t.id) into v_small_team_ids
      from public.team t
      where t.event_id = new.id
        and not t.dissolved
        and (select count(*) from public.participant p where p.team_id = t.id) < 2;

    if v_small_team_ids is not null then
      update public.participant
        set team_id = null
        where team_id = any(v_small_team_ids);

      update public.team
        set dissolved = true
        where id = any(v_small_team_ids);
    end if;
  end if;
  return new;
end;
$$;

create trigger event_status_live_dissolves_small_teams
  after update on public.event
  for each row
  execute function public.dissolve_undersized_teams();
