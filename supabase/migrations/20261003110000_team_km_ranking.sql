create function public.team_km_ranking()
returns table (
  user_id uuid,
  display_name text,
  total_km numeric,
  place integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid := private.caller_team_id();
begin
  if v_team_id is null
    or not (
      private.is_coach_of_team(v_team_id)
      or private.is_athlete_of_team(v_team_id)
    ) then
    raise exception 'Tylko członek zespołu może zobaczyć ranking.';
  end if;

  return query
  select
    m.user_id,
    m.display_name,
    coalesce(km.km_sum, 0),
    (rank() over (order by coalesce(km.km_sum, 0) desc))::integer
  from public.team_members as m
  left join (
    select
      s.user_id,
      sum(s.distance_km) as km_sum
    from public.training_submissions as s
    join public.trainings as t on t.id = s.training_id
    where t.team_id = v_team_id
      and t.training_on < (timezone('Europe/Warsaw', now()))::date
      and s.confirmed_at is not null
    group by s.user_id
  ) as km on km.user_id = m.user_id
  where m.team_id = v_team_id
    and m.role = 'athlete';
end;
$$;

revoke all on function public.team_km_ranking() from public;
revoke all on function public.team_km_ranking() from anon;
grant execute on function public.team_km_ranking() to authenticated;
