-- data_model — MILESTONE-02 (openspec/changes/data-model-rls).
-- Schema from SPEC.md §7.3, RLS from §7.5. See design.md for the decisions
-- referenced by number (D1..D8) in the comments below.

-- =============================================================================
-- 1. Tables (SPEC.md §7.3)
-- =============================================================================

create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  is_anonymous boolean not null default false,
  is_admin boolean not null default false,
  over16_ack boolean not null default false,
  tos_accepted_at timestamptz,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.event (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  title text not null,
  language text not null check (language in ('fr', 'en')),
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  venue_label text,
  waiting_media_path text,
  waiting_countdown_target timestamptz,
  current_step_id uuid, -- FK added below, after `step` exists
  season_year int,
  created_by uuid references public.profile (id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial unique index: at most one row with status = 'live' (task 1.2).
-- Every qualifying row projects the same constant, so a second one collides.
create unique index event_one_live_idx on public.event ((true)) where status = 'live';

create table public.step (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event (id) on delete cascade,
  "position" int not null,
  game_type text not null default 'mcq' check (game_type in ('mcq')),
  timed boolean not null default false,
  countdown_seconds int not null default 0,
  points_correct int not null default 1,
  team_award_points int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'active', 'locked', 'revealed', 'done')),
  timer_started_at timestamptz,
  unique (event_id, "position")
);

alter table public.event
  add constraint event_current_step_fk foreign key (current_step_id) references public.step (id);

-- The container seam for future game types (SPEC.md §7.3). Holds the answer
-- key — see D8 for why this table is never player-readable.
create table public.game_mcq (
  step_id uuid primary key references public.step (id) on delete cascade,
  question_text text not null,
  options jsonb not null,
  correct_option_id text not null
);

create table public.team (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event (id) on delete cascade,
  name text not null,
  captain_participant_id uuid, -- FK added below, after `participant` exists
  dissolved boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- Team name unique per event, case-insensitive (SPEC.md §7.3). A table-level
-- UNIQUE constraint can't take an expression like lower(name), so this needs
-- a real (unique) index instead.
create unique index team_event_name_lower_idx on public.team (event_id, lower(name));

create table public.participant (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event (id) on delete cascade,
  profile_id uuid not null references public.profile (id) on delete cascade,
  display_name text not null,
  team_id uuid references public.team (id),
  joined_at timestamptz not null default now(),
  joined_at_position int not null default 0,
  hidden boolean not null default false,
  unique (event_id, profile_id)
);

alter table public.team
  add constraint team_captain_fk foreign key (captain_participant_id) references public.participant (id);

create table public.answer (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.step (id) on delete cascade,
  participant_id uuid not null references public.participant (id) on delete cascade,
  option_id text not null,
  submitted_at timestamptz not null default now(),
  receipt_seq bigint not null,
  is_correct boolean not null,
  scored_points int not null default 0,
  -- One answer per participant per step (task 1.3).
  unique (step_id, participant_id)
);

create table public.step_result_participant (
  step_id uuid not null references public.step (id) on delete cascade,
  participant_id uuid not null references public.participant (id) on delete cascade,
  points int not null default 0,
  primary key (step_id, participant_id)
);

create table public.step_result_team (
  step_id uuid not null references public.step (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  avg_score numeric not null default 0,
  is_winner boolean not null default false,
  awarded_points int not null default 0,
  primary key (step_id, team_id)
);

create table public.event_final_participant (
  event_id uuid not null references public.event (id) on delete cascade,
  participant_id uuid not null references public.participant (id) on delete cascade,
  total_points int not null default 0,
  rank int not null,
  primary key (event_id, participant_id)
);

create table public.event_final_team (
  event_id uuid not null references public.event (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  total_awarded int not null default 0,
  rank int not null,
  primary key (event_id, team_id)
);

-- =============================================================================
-- 2. profile <- auth.users trigger (task 1.4, design D2)
-- =============================================================================

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, email, is_anonymous)
  values (new.id, new.email, coalesce(new.is_anonymous, false));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =============================================================================
-- 3. Admin promotion (task 1.5, design D4) — never invoked from a migration
-- with real emails; see README for the owner's manual, one-off invocation.
-- =============================================================================

create function public.app_promote_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  update public.profile
    set is_admin = true
    where email = target_email;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'app_promote_admin: no profile found with email %', target_email;
  end if;
end;
$$;

-- `revoke ... from public` alone is not enough: Supabase's default privileges
-- grant EXECUTE on every new public-schema function to anon/authenticated
-- explicitly (not just via PUBLIC), so each must be revoked by name too.
revoke all on function public.app_promote_admin(text) from public, anon, authenticated;
grant execute on function public.app_promote_admin(text) to service_role;

-- =============================================================================
-- 4. RLS helpers
-- =============================================================================

-- SECURITY DEFINER so these can read `profile`/`event`/`step` to answer the
-- question without themselves being subject to (and recursing into) the RLS
-- policies defined below (design D3).

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profile where id = auth.uid()), false);
$$;

create function public.is_participant_of(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participant
    where event_id = target_event_id and profile_id = auth.uid()
  );
$$;

create function public.event_is_draft(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status = 'draft' from public.event where id = target_event_id), false);
$$;

create function public.step_event_id(target_step_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select event_id from public.step where id = target_step_id;
$$;

create function public.step_event_is_draft(target_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.event_is_draft(public.step_event_id(target_step_id));
$$;

-- =============================================================================
-- 5. Row Level Security (task 2.1)
-- =============================================================================

alter table public.profile enable row level security;
alter table public.event enable row level security;
alter table public.step enable row level security;
alter table public.game_mcq enable row level security;
alter table public.team enable row level security;
alter table public.participant enable row level security;
alter table public.answer enable row level security;
alter table public.step_result_participant enable row level security;
alter table public.step_result_team enable row level security;
alter table public.event_final_participant enable row level security;
alter table public.event_final_team enable row level security;

-- No insert/update/delete policy exists for `profile` for anon/authenticated:
-- the only writers are the trigger above (SECURITY DEFINER) and service_role.
-- This is what makes admin status impossible to self-grant (FR-011).

-- --- profile (task 2.2) -------------------------------------------------

create policy profile_select_self_or_admin on public.profile
  for select
  using (id = auth.uid() or public.is_admin());

-- --- participant (task 2.2) ---------------------------------------------

create policy participant_select_self_or_admin on public.participant
  for select
  using (profile_id = auth.uid() or public.is_admin());

-- --- event (tasks 2.3, 2.4) ----------------------------------------------

create policy event_select_participant_or_admin on public.event
  for select
  using (public.is_admin() or public.is_participant_of(id));

-- Admin authoring is only ever allowed while draft, on both the old row
-- (USING) and the new row (WITH CHECK) — this also means an admin cannot
-- use this policy to flip status away from draft; that transition happens
-- through the real-time worker's service-role writes instead.
create policy event_admin_write_while_draft on public.event
  for all
  using (public.is_admin() and status = 'draft')
  with check (public.is_admin() and status = 'draft');

-- --- step (tasks 2.3, 2.4) ------------------------------------------------

create policy step_select_participant_or_admin on public.step
  for select
  using (public.is_admin() or public.is_participant_of(event_id));

create policy step_admin_write_while_draft on public.step
  for all
  using (public.is_admin() and public.event_is_draft(event_id))
  with check (public.is_admin() and public.event_is_draft(event_id));

-- --- team (tasks 2.3, 2.4) ------------------------------------------------

create policy team_select_participant_or_admin on public.team
  for select
  using (public.is_admin() or public.is_participant_of(event_id));

create policy team_admin_write_while_draft on public.team
  for all
  using (public.is_admin() and public.event_is_draft(event_id))
  with check (public.is_admin() and public.event_is_draft(event_id));

-- --- game_mcq (tasks 2.4, 2.5) — admin-only for read AND write (D8) -------

create policy game_mcq_select_admin_only on public.game_mcq
  for select
  using (true); -- TEMP: verify CI catches this RLS regression (task 5.1), then revert

create policy game_mcq_admin_write_while_draft on public.game_mcq
  for all
  using (public.is_admin() and public.step_event_is_draft(step_id))
  with check (public.is_admin() and public.step_event_is_draft(step_id));

-- --- answer, results (task 2.5) — administrative data, admin-only read ---
-- No insert/update/delete policy for anon/authenticated on any of these:
-- writes come only from the Durable Object via the service-role key.

create policy answer_select_admin_only on public.answer
  for select
  using (public.is_admin());

create policy step_result_participant_select_admin_only on public.step_result_participant
  for select
  using (public.is_admin());

create policy step_result_team_select_admin_only on public.step_result_team
  for select
  using (public.is_admin());

create policy event_final_participant_select_admin_only on public.event_final_participant
  for select
  using (public.is_admin());

create policy event_final_team_select_admin_only on public.event_final_team
  for select
  using (public.is_admin());

-- =============================================================================
-- 6. season_score view (task 2.6, design D5)
-- =============================================================================

-- security_invoker = true: the view runs with the *caller's* RLS, so it is
-- transitively admin-only via event_final_participant's policy above, with
-- no bespoke policy of its own needed.
create view public.season_score
  with (security_invoker = true) as
select
  p.id as profile_id,
  e.season_year,
  sum(efp.total_points) as total_points
from public.event_final_participant efp
join public.participant pa on pa.id = efp.participant_id
join public.profile p on p.id = pa.profile_id
join public.event e on e.id = efp.event_id
where p.is_anonymous = false
  and p.deleted_at is null
  and e.season_year is not null
group by p.id, e.season_year;
