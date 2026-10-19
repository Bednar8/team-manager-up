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

create function public.delete_training_photo(training_on date)
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
    and public.trainings.training_on = delete_training_photo.training_on;

  if not found then
    raise exception 'Tego dnia nie ma zdjęcia.';
  end if;

  select storage_path
  into v_storage_path
  from public.training_submissions
  where training_id = v_training_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Tego dnia nie ma zdjęcia.';
  end if;

  delete from public.training_submissions
  where training_id = v_training_id
    and user_id = v_user_id;

  return v_storage_path;
end;
$$;

revoke all on function public.delete_training_photo(date) from public;
revoke all on function public.delete_training_photo(date) from anon;
grant execute on function public.delete_training_photo(date) to authenticated;
