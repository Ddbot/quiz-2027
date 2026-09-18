-- moderate_participant / moderate_team — MILESTONE-11 (openspec/changes/moderation-kill-switch).
-- Admin-only hide/rename operations (design D2), usable regardless of
-- event.status (unlike ordinary event/step/team authoring).

-- =============================================================================
-- moderate_participant (task 2.1)
-- =============================================================================

-- A null parameter leaves that field unchanged (partial update, matching the
-- REST contract's `hidden?`/`display_name?` optionality). Mirrors
-- create_team/rename_team's exact security-definer + is_profane() pattern —
-- deliberately has NO event.status check, unlike those (FR-070: "before or
-- during an event").
create function public.moderate_participant(
  p_participant_id uuid,
  p_hidden boolean default null,
  p_display_name text default null
)
returns public.participant
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.participant%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_display_name is not null and public.is_profane(p_display_name) then
    raise exception 'profanity' using errcode = 'P0001';
  end if;

  update public.participant
    set hidden = coalesce(p_hidden, hidden),
        display_name = coalesce(p_display_name, display_name)
    where id = p_participant_id
    returning * into v_participant;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_participant;
end;
$$;

revoke all on function public.moderate_participant(uuid, boolean, text) from public, anon;
grant execute on function public.moderate_participant(uuid, boolean, text) to authenticated;

-- =============================================================================
-- moderate_team (task 2.1)
-- =============================================================================

create function public.moderate_team(
  p_team_id uuid,
  p_hidden boolean default null,
  p_name text default null
)
returns public.team
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.team%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is not null and public.is_profane(p_name) then
    raise exception 'profanity' using errcode = 'P0001';
  end if;

  update public.team
    set hidden = coalesce(p_hidden, hidden),
        name = coalesce(p_name, name)
    where id = p_team_id
    returning * into v_team;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_team;
end;
$$;

revoke all on function public.moderate_team(uuid, boolean, text) from public, anon;
grant execute on function public.moderate_team(uuid, boolean, text) to authenticated;
