create table public.training_submissions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  model_distance_km numeric,
  model_duration_seconds integer,
  model_max_speed_kmh numeric,
  distance_km numeric,
  duration_seconds integer,
  max_speed_kmh numeric,
  athlete_edited boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_submissions_training_id_user_id_key unique (training_id, user_id),
  constraint training_submissions_confirmed_has_km check (
    confirmed_at is null or distance_km > 0
  )
);

revoke all on table public.training_submissions from anon, authenticated, public;
grant select on table public.training_submissions to authenticated;

alter table public.training_submissions enable row level security;

create policy "training_submissions_select_own"
  on public.training_submissions
  for select
  to authenticated
  using (user_id = auth.uid());

-- athlete check, mirror of private.is_coach_of_team
create function private.is_athlete_of_team(p_team_id uuid)
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
      and role = 'athlete'
  );
$$;

revoke all on function private.is_athlete_of_team(uuid) from public;
revoke all on function private.is_athlete_of_team(uuid) from anon;
grant execute on function private.is_athlete_of_team(uuid) to authenticated;

create function public.begin_training_photo(training_on date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid := private.caller_team_id();
  v_user_id uuid := auth.uid();
  v_training_id uuid;
  v_storage_path text;
  v_confirmed_at timestamptz;
begin
  if v_team_id is null or not private.is_athlete_of_team(v_team_id) then
    raise exception 'Tylko zawodnik może dodać zdjęcie treningu.';
  end if;

  if training_on <> (timezone('Europe/Warsaw', now()))::date then
    raise exception 'Zdjęcie można wgrać tylko w dniu treningu.';
  end if;

  select id
  into v_training_id
  from public.trainings
  where team_id = v_team_id
    and public.trainings.training_on = begin_training_photo.training_on;

  if not found then
    raise exception 'Tego dnia nie ma treningu.';
  end if;

  select storage_path, confirmed_at
  into v_storage_path, v_confirmed_at
  from public.training_submissions
  where training_id = v_training_id
    and user_id = v_user_id;

  if found then
    if v_confirmed_at is not null then
      raise exception 'To zdjęcie jest już potwierdzone.';
    end if;

    update public.training_submissions
    set
      model_distance_km = null,
      model_duration_seconds = null,
      model_max_speed_kmh = null,
      distance_km = null,
      duration_seconds = null,
      max_speed_kmh = null,
      athlete_edited = false
    where training_id = v_training_id
      and user_id = v_user_id;

    return v_storage_path;
  end if;

  v_storage_path := v_team_id::text || '/' || v_training_id::text || '/' || v_user_id::text;

  insert into public.training_submissions (training_id, user_id, storage_path)
  values (v_training_id, v_user_id, v_storage_path);

  return v_storage_path;
end;
$$;

revoke all on function public.begin_training_photo(date) from public;
revoke all on function public.begin_training_photo(date) from anon;
grant execute on function public.begin_training_photo(date) to authenticated;

create function public.confirm_training_photo(
  training_on date,
  distance_km numeric,
  duration_seconds integer,
  max_speed_kmh numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid := private.caller_team_id();
  v_user_id uuid := auth.uid();
  v_training_id uuid;
  v_confirmed_at timestamptz;
  v_model_distance_km numeric;
  v_model_duration_seconds integer;
  v_model_max_speed_kmh numeric;
begin
  if v_team_id is null or not private.is_athlete_of_team(v_team_id) then
    raise exception 'Tylko zawodnik może dodać zdjęcie treningu.';
  end if;

  if training_on <> (timezone('Europe/Warsaw', now()))::date then
    raise exception 'Zdjęcie można wgrać tylko w dniu treningu.';
  end if;

  select id
  into v_training_id
  from public.trainings
  where team_id = v_team_id
    and public.trainings.training_on = confirm_training_photo.training_on;

  if not found then
    raise exception 'Tego dnia nie ma treningu.';
  end if;

  select
    confirmed_at,
    model_distance_km,
    model_duration_seconds,
    model_max_speed_kmh
  into
    v_confirmed_at,
    v_model_distance_km,
    v_model_duration_seconds,
    v_model_max_speed_kmh
  from public.training_submissions
  where training_id = v_training_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Tego dnia nie ma zdjęcia.';
  end if;

  if v_confirmed_at is not null then
    raise exception 'To zdjęcie jest już potwierdzone.';
  end if;

  if distance_km is null or distance_km <= 0 then
    raise exception 'Podaj liczbę kilometrów większą od zera.';
  end if;

  update public.training_submissions
  set
    distance_km = confirm_training_photo.distance_km,
    duration_seconds = confirm_training_photo.duration_seconds,
    max_speed_kmh = confirm_training_photo.max_speed_kmh,
    athlete_edited = (
      confirm_training_photo.distance_km is distinct from v_model_distance_km
      or confirm_training_photo.duration_seconds is distinct from v_model_duration_seconds
      or confirm_training_photo.max_speed_kmh is distinct from v_model_max_speed_kmh
    ),
    confirmed_at = now()
  where training_id = v_training_id
    and user_id = v_user_id;
end;
$$;

revoke all on function public.confirm_training_photo(date, numeric, integer, numeric) from public;
revoke all on function public.confirm_training_photo(date, numeric, integer, numeric) from anon;
grant execute on function public.confirm_training_photo(date, numeric, integer, numeric) to authenticated;

create function public.record_training_readout(
  user_id uuid,
  training_on date,
  distance_km numeric,
  duration_seconds integer,
  max_speed_kmh numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id uuid;
  v_confirmed_at timestamptz;
begin
  begin
    select s.id, s.confirmed_at
    into strict v_submission_id, v_confirmed_at
    from public.training_submissions s
    join public.trainings t on t.id = s.training_id
    where s.user_id = record_training_readout.user_id
      and t.training_on = record_training_readout.training_on;
  exception
    when no_data_found then
      raise exception 'Tego dnia nie ma zdjęcia.';
  end;

  if v_confirmed_at is not null then
    raise exception 'To zdjęcie jest już potwierdzone.';
  end if;

  update public.training_submissions
  set
    model_distance_km = record_training_readout.distance_km,
    model_duration_seconds = record_training_readout.duration_seconds,
    model_max_speed_kmh = record_training_readout.max_speed_kmh,
    distance_km = record_training_readout.distance_km,
    duration_seconds = record_training_readout.duration_seconds,
    max_speed_kmh = record_training_readout.max_speed_kmh
  where id = v_submission_id;
end;
$$;

revoke all on function public.record_training_readout(uuid, date, numeric, integer, numeric) from public;
revoke all on function public.record_training_readout(uuid, date, numeric, integer, numeric) from anon;
revoke all on function public.record_training_readout(uuid, date, numeric, integer, numeric) from authenticated;
grant execute on function public.record_training_readout(uuid, date, numeric, integer, numeric) to service_role;

insert into storage.buckets (id, name, public)
values ('training-photos', 'training-photos', false);
