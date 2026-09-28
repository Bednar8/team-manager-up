create table public.trainings (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  training_on date not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint trainings_team_id_training_on_key unique (team_id, training_on),
  constraint trainings_description_trimmed_length check (
    description = btrim(description)
    and char_length(description) between 1 and 200
  )
);

revoke all on table public.trainings from anon, authenticated, public;
grant select on table public.trainings to authenticated;

alter table public.trainings enable row level security;

create policy "trainings_select_team"
  on public.trainings
  for select
  to authenticated
  using (team_id = private.caller_team_id());

create function public.create_training(training_on date, description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid := private.caller_team_id();
  v_description text := btrim(description);
begin
  if v_team_id is null or not private.is_coach_of_team(v_team_id) then
    raise exception 'Tylko trener może zmieniać treningi.';
  end if;

  if training_on < (timezone('Europe/Warsaw', now()))::date then
    raise exception 'Trening można dodać, zmienić albo usunąć tylko na dziś lub później.';
  end if;

  if v_description is null or char_length(v_description) not between 1 and 200 then
    raise exception 'Opis musi mieć od 1 do 200 znaków.';
  end if;

  begin
    insert into public.trainings (id, team_id, training_on, description)
    values (gen_random_uuid(), v_team_id, training_on, v_description);
  exception
    when unique_violation then
      raise exception 'Tego dnia trening już jest.';
  end;
end;
$$;

revoke all on function public.create_training(date, text) from public;
revoke all on function public.create_training(date, text) from anon;
grant execute on function public.create_training(date, text) to authenticated;

create function public.update_training_description(training_on date, description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid := private.caller_team_id();
  v_description text := btrim(description);
begin
  if v_team_id is null or not private.is_coach_of_team(v_team_id) then
    raise exception 'Tylko trener może zmieniać treningi.';
  end if;

  if training_on < (timezone('Europe/Warsaw', now()))::date then
    raise exception 'Trening można dodać, zmienić albo usunąć tylko na dziś lub później.';
  end if;

  if v_description is null or char_length(v_description) not between 1 and 200 then
    raise exception 'Opis musi mieć od 1 do 200 znaków.';
  end if;

  update public.trainings
  set description = v_description
  where team_id = v_team_id
    and public.trainings.training_on = update_training_description.training_on;

  if not found then
    raise exception 'Tego dnia nie ma treningu.';
  end if;
end;
$$;

revoke all on function public.update_training_description(date, text) from public;
revoke all on function public.update_training_description(date, text) from anon;
grant execute on function public.update_training_description(date, text) to authenticated;

create function public.delete_training(training_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid := private.caller_team_id();
begin
  if v_team_id is null or not private.is_coach_of_team(v_team_id) then
    raise exception 'Tylko trener może zmieniać treningi.';
  end if;

  if training_on < (timezone('Europe/Warsaw', now()))::date then
    raise exception 'Trening można dodać, zmienić albo usunąć tylko na dziś lub później.';
  end if;

  delete from public.trainings
  where team_id = v_team_id
    and public.trainings.training_on = delete_training.training_on;

  if not found then
    raise exception 'Tego dnia nie ma treningu.';
  end if;
end;
$$;

revoke all on function public.delete_training(date) from public;
revoke all on function public.delete_training(date) from anon;
grant execute on function public.delete_training(date) to authenticated;
