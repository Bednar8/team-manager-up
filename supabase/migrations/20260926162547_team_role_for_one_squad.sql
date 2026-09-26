-- private schema: security-definer helpers only (not in [api].schemas)
create schema private;

revoke usage on schema private from public;
grant usage on schema private to authenticated;

create table public.teams (
  id uuid primary key,
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint teams_name_trimmed_length check (
    name = btrim(name)
    and char_length(name) between 1 and 80
  )
);

create table public.team_members (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint team_members_user_id_key unique (user_id),
  constraint team_members_role_check check (role in ('coach', 'athlete')),
  constraint team_members_display_name_trimmed_length check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 80
  )
);

-- one coach per team
create unique index team_members_one_coach_per_team
  on public.team_members (team_id)
  where (role = 'coach');

-- teams SELECT policy looks up memberships by team_id
create index team_members_team_id_idx on public.team_members (team_id);

revoke all on table public.teams from anon, authenticated, public;
revoke all on table public.team_members from anon, authenticated, public;
grant select, insert on table public.teams to authenticated;
grant select, insert on table public.team_members to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "teams_select_member"
  on public.teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_members
      where team_members.team_id = teams.id
        and team_members.user_id = auth.uid()
    )
  );

create policy "teams_insert_creator_without_membership"
  on public.teams
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and not exists (
      select 1
      from public.team_members
      where team_members.user_id = auth.uid()
    )
  );

create policy "team_members_select_own"
  on public.team_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- SECURITY DEFINER: bypasses RLS so coach-existence check sees other members' rows
create function private.team_created_by_caller_without_coach(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.teams t
      where t.id = p_team_id
        and t.created_by = auth.uid()
    )
    and not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.role = 'coach'
    );
$$;

revoke all on function private.team_created_by_caller_without_coach(uuid) from public;
revoke all on function private.team_created_by_caller_without_coach(uuid) from anon;
grant execute on function private.team_created_by_caller_without_coach(uuid) to authenticated;

create policy "team_members_insert_coach"
  on public.team_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'coach'
    and not exists (
      select 1
      from public.team_members
      where team_members.user_id = auth.uid()
    )
    and private.team_created_by_caller_without_coach(team_id)
  );

create function public.create_coach_team(team_name text, display_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_team_name text := btrim(team_name);
  v_display_name text := btrim(display_name);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1
    from public.team_members
    where user_id = v_uid
  ) then
    raise exception 'already a member of a team';
  end if;

  v_team_id := gen_random_uuid();

  insert into public.teams (id, name, created_by)
  values (v_team_id, v_team_name, v_uid);

  insert into public.team_members (id, team_id, user_id, role, display_name)
  values (gen_random_uuid(), v_team_id, v_uid, 'coach', v_display_name);

  return v_team_id;
end;
$$;

revoke all on function public.create_coach_team(text, text) from public;
revoke all on function public.create_coach_team(text, text) from anon;
grant execute on function public.create_coach_team(text, text) to authenticated;
