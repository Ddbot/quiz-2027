-- analytics-dashboard — MILESTONE-12.
-- `join_event` gains joined_at_position stamping (design D1), new
-- `event_dashboard` RPC (design D3/D4/D5/D6). See
-- openspec/changes/analytics-dashboard/design.md.

-- =============================================================================
-- 1. join_event — extended in place (task 1.1, design D1). Same signature as
-- the original (supabase/migrations/20260914140924_join_event.sql); only the
-- INSERT branch changes, to stamp `joined_at_position` from whatever step is
-- current when the row is first created. The "already joined" branch is
-- untouched — a returning participant's `joined_at_position` is never
-- recomputed.
-- =============================================================================

create or replace function public.join_event(
  p_join_code text,
  p_display_name text,
  p_over16_ack boolean default null,
  p_marketing_consent boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.event%rowtype;
  v_participant public.participant%rowtype;
  v_current_position int;
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

  if p_over16_ack is not null then
    update public.profile
      set over16_ack = p_over16_ack,
          tos_accepted_at = now(),
          marketing_consent = coalesce(p_marketing_consent, false)
      where id = auth.uid();
  end if;

  select * into v_participant
    from public.participant
    where event_id = v_event.id and profile_id = auth.uid();

  if not found then
    -- Resolve the event's current step position — a null current_step_id
    -- (event not yet started) resolves to 0, so a participant who joins
    -- before the event starts is later counted as present for every step
    -- (analytics capability, FR-073).
    select s.position into v_current_position
      from public.step s
      where s.id = v_event.current_step_id;

    insert into public.participant (event_id, profile_id, display_name, joined_at_position)
    values (v_event.id, auth.uid(), p_display_name, coalesce(v_current_position, 0))
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

-- =============================================================================
-- 2. event_dashboard (task 1.2, analytics capability) — admin-only, per-event
-- analytics. `completion_rate` is a fraction (0..1), not a percentage — the
-- console formats it for display. Never selects/joins `profile` — no email
-- anywhere (FR-074).
-- =============================================================================

create function public.event_dashboard(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_count int;
  v_total_answers int;
  v_total_present_steps int;
  v_completion_rate numeric;
  v_avg_response_ms numeric;
  v_per_question jsonb;
  v_final_participants jsonb;
  v_final_teams jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_participant_count
    from public.participant
    where event_id = p_event_id;

  -- Sum, across every participant, of the count of already-revealed steps
  -- they were present for (design D3) — a late joiner's `joined_at_position`
  -- excludes steps revealed before they arrived.
  select coalesce(sum(present.count), 0) into v_total_present_steps
    from public.participant p
    cross join lateral (
      select count(*) as count
        from public.step s
        where s.event_id = p_event_id
          and s.status = 'revealed'
          and s.position >= p.joined_at_position
    ) present
    where p.event_id = p_event_id;

  select count(*) into v_total_answers
    from public.answer a
    join public.step s on s.id = a.step_id
    where s.event_id = p_event_id;

  v_completion_rate := case
    when v_total_present_steps > 0 then v_total_answers::numeric / v_total_present_steps
    else 0
  end;

  select avg(extract(epoch from (a.submitted_at - s.timer_started_at)) * 1000) into v_avg_response_ms
    from public.answer a
    join public.step s on s.id = a.step_id
    where s.event_id = p_event_id and s.timer_started_at is not null;

  select coalesce(jsonb_agg(
      jsonb_build_object('step_id', q.step_id, 'correct', q.correct, 'incorrect', q.incorrect)
      order by st.position
    ), '[]'::jsonb) into v_per_question
    from (
      select a.step_id,
        count(*) filter (where a.is_correct) as correct,
        count(*) filter (where not a.is_correct) as incorrect
      from public.answer a
      join public.step s on s.id = a.step_id
      where s.event_id = p_event_id
      group by a.step_id
    ) q
    join public.step st on st.id = q.step_id;

  select coalesce(jsonb_agg(
      jsonb_build_object(
        'participant_id', efp.participant_id,
        'display_name', p.display_name,
        'total_points', efp.total_points,
        'rank', efp.rank
      ) order by efp.rank
    ), '[]'::jsonb) into v_final_participants
    from public.event_final_participant efp
    join public.participant p on p.id = efp.participant_id
    where efp.event_id = p_event_id;

  select coalesce(jsonb_agg(
      jsonb_build_object(
        'team_id', eft.team_id,
        'name', t.name,
        'total_awarded', eft.total_awarded,
        'rank', eft.rank
      ) order by eft.rank
    ), '[]'::jsonb) into v_final_teams
    from public.event_final_team eft
    join public.team t on t.id = eft.team_id
    where eft.event_id = p_event_id;

  return jsonb_build_object(
    'participant_count', v_participant_count,
    'completion_rate', v_completion_rate,
    'per_question', v_per_question,
    'avg_response_ms', coalesce(v_avg_response_ms, 0),
    'final_participants', v_final_participants,
    'final_teams', v_final_teams
  );
end;
$$;

revoke all on function public.event_dashboard(uuid) from public, anon;
grant execute on function public.event_dashboard(uuid) to authenticated;
