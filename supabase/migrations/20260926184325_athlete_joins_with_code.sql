-- team join codes: one reusable code per team (not a column on teams)
create table public.team_join_codes (
  team_id uuid primary key references public.teams (id) on delete cascade,
  code text not null unique,
  constraint team_join_codes_code_format check (
    code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
  )
);

revoke all on table public.team_join_codes from anon, authenticated, public;
grant select on table public.team_join_codes to authenticated;

alter table public.team_join_codes enable row level security;

-- coach check for join-code select (avoids team_members subquery under RLS)
create function private.is_coach_of_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = p_team_id
      and user_id = auth.uid()
      and role = 'coach'
  );
$$;

revoke all on function private.is_coach_of_team(uuid) from public;
revoke all on function private.is_coach_of_team(uuid) from anon;
grant execute on function private.is_coach_of_team(uuid) to authenticated;

create policy "team_join_codes_select_coach"
  on public.team_join_codes
  for select
  to authenticated
  using (private.is_coach_of_team(team_id));

-- shared alphabet generator (owner-only; backfill does not use this)
create function private.generate_team_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + (floor(random() * 32))::int, 1);
  end loop;
  return result;
end;
$$;

revoke all on function private.generate_team_join_code() from public;
revoke all on function private.generate_team_join_code() from anon;
revoke all on function private.generate_team_join_code() from authenticated;

-- issue initial code: caller must be coach; team must not have a code yet
create function private.issue_team_join_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not private.is_coach_of_team(p_team_id) then
    raise exception 'not a coach of this team';
  end if;

  if exists (
    select 1
    from public.team_join_codes
    where team_id = p_team_id
  ) then
    raise exception 'team already has a join code';
  end if;

  loop
    v_code := private.generate_team_join_code();
    begin
      insert into public.team_join_codes (team_id, code)
      values (p_team_id, v_code);
      return v_code;
    exception
      when unique_violation then
        null; -- retry on code collision
    end;
  end loop;
end;
$$;

revoke all on function private.issue_team_join_code(uuid) from public;
revoke all on function private.issue_team_join_code(uuid) from anon;
grant execute on function private.issue_team_join_code(uuid) to authenticated;

-- create_coach_team: same signature/grants; now issues join code in the same transaction
create or replace function public.create_coach_team(team_name text, display_name text)
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

  perform private.issue_team_join_code(v_team_id);

  return v_team_id;
end;
$$;

revoke all on function public.create_coach_team(text, text) from public;
revoke all on function public.create_coach_team(text, text) from anon;
grant execute on function public.create_coach_team(text, text) to authenticated;

-- backfill: migration owner, no auth.uid(); do not use the coach-gated issue helper
do $$
declare
  r record;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  for r in
    select t.id
    from public.teams t
    where not exists (
      select 1
      from public.team_join_codes c
      where c.team_id = t.id
    )
  loop
    loop
      v_code := '';
      for i in 1..8 loop
        v_code := v_code || substr(alphabet, 1 + (floor(random() * 32))::int, 1);
      end loop;
      begin
        insert into public.team_join_codes (team_id, code)
        values (r.id, v_code);
        exit;
      exception
        when unique_violation then
          null; -- retry on code collision
      end;
    end loop;
  end loop;
end;
$$;

create function public.join_team_with_code(join_code text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text := btrim(display_name);
  v_code text;
  v_team_id uuid;
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

  v_code := upper(replace(replace(btrim(join_code), ' ', ''), '-', ''));

  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    raise exception 'That code does not match a team';
  end if;

  select team_id
  into v_team_id
  from public.team_join_codes
  where code = v_code;

  if v_team_id is null then
    raise exception 'That code does not match a team';
  end if;

  insert into public.team_members (id, team_id, user_id, role, display_name)
  values (gen_random_uuid(), v_team_id, v_uid, 'athlete', v_display_name);

  return v_team_id;
end;
$$;

revoke all on function public.join_team_with_code(text, text) from public;
revoke all on function public.join_team_with_code(text, text) from anon;
grant execute on function public.join_team_with_code(text, text) to authenticated;

create function public.replace_team_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select team_id
  into v_team_id
  from public.team_members
  where user_id = v_uid
    and role = 'coach';

  if v_team_id is null then
    raise exception 'not a coach';
  end if;

  loop
    v_code := private.generate_team_join_code();
    begin
      update public.team_join_codes
      set code = v_code
      where team_id = v_team_id;

      if not found then
        raise exception 'team has no join code';
      end if;

      return v_code;
    exception
      when unique_violation then
        null; -- retry on code collision
    end;
  end loop;
end;
$$;

revoke all on function public.replace_team_join_code() from public;
revoke all on function public.replace_team_join_code() from anon;
grant execute on function public.replace_team_join_code() to authenticated;

-- squad visibility: every member sees every row on their team
create function private.caller_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id
  from public.team_members
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function private.caller_team_id() from public;
revoke all on function private.caller_team_id() from anon;
grant execute on function private.caller_team_id() to authenticated;

drop policy "team_members_select_own" on public.team_members;

create policy "team_members_select_team"
  on public.team_members
  for select
  to authenticated
  using (team_id = private.caller_team_id());
