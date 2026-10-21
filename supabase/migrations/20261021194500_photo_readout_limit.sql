create table public.photo_readout_uses (
  user_id uuid not null references auth.users (id) on delete cascade,
  used_on date not null,
  used_count integer not null,
  primary key (user_id, used_on),
  constraint photo_readout_uses_used_count_check check (used_count between 1 and 2)
);

revoke all on table public.photo_readout_uses from anon, authenticated, public;
grant select on table public.photo_readout_uses to authenticated;

alter table public.photo_readout_uses enable row level security;

create policy "photo_readout_uses_select_own"
  on public.photo_readout_uses
  for select
  to authenticated
  using (user_id = auth.uid());

create function public.assert_photo_readout_day(training_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if training_on <> (timezone('Europe/Warsaw', now()))::date then
    raise exception 'Zdjęcie można wgrać tylko w dniu treningu.';
  end if;
end;
$$;

revoke all on function public.assert_photo_readout_day(date) from public;
revoke all on function public.assert_photo_readout_day(date) from anon;
grant execute on function public.assert_photo_readout_day(date) to authenticated;

create function public.reserve_photo_readout()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (timezone('Europe/Warsaw', now()))::date;
  v_used integer;
begin
  insert into public.photo_readout_uses (user_id, used_on, used_count)
  values (v_user_id, v_today, 1)
  on conflict (user_id, used_on)
  do update set used_count = public.photo_readout_uses.used_count + 1
  where public.photo_readout_uses.used_count < 2
  returning used_count into v_used;

  if not found then
    raise exception 'Dziś można wgrać najwyżej dwa zdjęcia.';
  end if;

  return v_used;
end;
$$;

revoke all on function public.reserve_photo_readout() from public;
revoke all on function public.reserve_photo_readout() from anon;
grant execute on function public.reserve_photo_readout() to authenticated;

create or replace function public.begin_training_photo(training_on date)
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
  v_used_count integer;
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

  select used_count
  into v_used_count
  from public.photo_readout_uses
  where user_id = v_user_id
    and used_on = (timezone('Europe/Warsaw', now()))::date;

  if v_used_count = 2 then
    raise exception 'Dziś można wgrać najwyżej dwa zdjęcia.';
  end if;

  select storage_path
  into v_storage_path
  from public.training_submissions
  where training_id = v_training_id
    and user_id = v_user_id;

  if found then
    update public.training_submissions
    set
      model_distance_km = null,
      model_duration_seconds = null,
      model_max_speed_kmh = null,
      distance_km = null,
      duration_seconds = null,
      max_speed_kmh = null,
      athlete_edited = false,
      confirmed_at = null,
      submitter_display_name = null
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
