alter table public.training_submissions
  add column submitter_display_name text,
  add constraint training_submissions_submitter_display_name_trimmed_length check (
    submitter_display_name is null
    or (
      submitter_display_name = btrim(submitter_display_name)
      and char_length(submitter_display_name) between 1 and 80
    )
  );

create policy "training_submissions_select_coach"
  on public.training_submissions
  for select
  to authenticated
  using (
    confirmed_at is not null
    and exists (
      select 1
      from public.trainings t
      where t.id = training_submissions.training_id
        and private.is_coach_of_team(t.team_id)
    )
  );

create or replace function public.confirm_training_photo(
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
  v_display_name text;
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

  select display_name
  into v_display_name
  from public.team_members
  where user_id = v_user_id;

  if not found or v_display_name is null then
    raise exception 'W składzie nie ma imienia.';
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
    submitter_display_name = v_display_name,
    confirmed_at = now()
  where training_id = v_training_id
    and user_id = v_user_id;
end;
$$;

update public.training_submissions as s
set submitter_display_name = tm.display_name
from public.team_members as tm
where s.user_id = tm.user_id
  and s.confirmed_at is not null;
