-- All game data is served by authenticated Vercel endpoints. No browser writes.
create table public.game_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.player_profiles (
  user_id uuid primary key references public.game_members(user_id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 24)
);
create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.game_members(user_id) on delete cascade,
  game text not null check (game in ('pong', 'boxing', 'tic-tac-toe')),
  rule_version integer not null default 1 check (rule_version = 1),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'abandoned'))
);
create index game_runs_user_started on public.game_runs(user_id, started_at desc);
create table public.game_scores (
  run_id uuid primary key references public.game_runs(id) on delete cascade,
  user_id uuid not null references public.game_members(user_id) on delete cascade,
  game text not null check (game in ('pong', 'boxing', 'tic-tac-toe')),
  rule_version integer not null check (rule_version = 1),
  score integer not null,
  secondary_score integer not null default 0,
  details jsonb not null,
  created_at timestamptz not null default now(),
  check ((game = 'pong' and score between 0 and 1 and secondary_score between -5 and 5)
    or (game = 'boxing' and score between 0 and 600 and secondary_score between score and 600)
    or (game = 'tic-tac-toe' and score between 0 and 30 and secondary_score = 0))
);
create index game_scores_ranking on public.game_scores(game, rule_version, score desc, secondary_score desc);
create index game_scores_user on public.game_scores(user_id);

alter table public.game_members enable row level security;
alter table public.player_profiles enable row level security;
alter table public.game_runs enable row level security;
alter table public.game_scores enable row level security;
revoke all on public.game_members, public.player_profiles, public.game_runs, public.game_scores from anon, authenticated;
grant select, insert, update, delete on public.game_members, public.player_profiles, public.game_runs, public.game_scores to service_role;
-- No anon/authenticated policies by design: server verifies token + membership.

create function public.start_game_run(p_user uuid, p_game text)
returns public.game_runs language plpgsql security invoker set search_path = '' as $$
declare r public.game_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if not exists (select 1 from public.game_members where user_id=p_user and active) then
    raise exception 'MEMBER_REQUIRED';
  end if;
  if p_game not in ('pong','boxing','tic-tac-toe') then raise exception 'INVALID_GAME'; end if;
  if (select count(*) from public.game_runs where user_id=p_user and started_at>now()-interval '1 minute') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  update public.game_runs set status='abandoned' where user_id=p_user and game=p_game and status='pending';
  insert into public.game_runs(user_id, game) values(p_user,p_game) returning * into r;
  return r;
end;
$$;

create function public.finish_game_run(p_user uuid, p_run uuid, p_score integer, p_secondary integer, p_details jsonb)
returns public.game_scores language plpgsql security invoker set search_path = '' as $$
declare r public.game_runs; s public.game_scores;
begin
  if not exists (select 1 from public.game_members where user_id=p_user and active) then raise exception 'MEMBER_REQUIRED'; end if;
  select * into r from public.game_runs where id=p_run and user_id=p_user for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if r.status='completed' then
    select * into s from public.game_scores where run_id=r.id;
    return s;
  end if;
  if r.status <> 'pending' or r.expires_at<now() then raise exception 'RUN_EXPIRED'; end if;
  if (r.game='boxing' and now()<r.started_at+interval '58 seconds')
    or (r.game='pong' and now()<r.started_at+interval '5 seconds')
    or (r.game='tic-tac-toe' and now()<r.started_at+interval '10 seconds') then raise exception 'RUN_TOO_SHORT'; end if;
  insert into public.game_scores(run_id,user_id,game,rule_version,score,secondary_score,details)
    values(r.id,p_user,r.game,r.rule_version,p_score,p_secondary,p_details) returning * into s;
  update public.game_runs set status='completed' where id=r.id;
  return s;
end;
$$;

create function public.game_leaderboard(p_user uuid, p_game text)
returns table(user_id uuid, display_name text, score integer, secondary_score integer, place bigint, own boolean)
language sql stable security invoker set search_path = '' as $$
  with best as (
    select distinct on (s.user_id) s.user_id, coalesce(p.display_name,'Spieler') as display_name, s.score, s.secondary_score
    from public.game_scores s join public.game_members m on m.user_id=s.user_id and m.active
    left join public.player_profiles p on p.user_id=s.user_id
    where s.game=p_game and s.rule_version=1
      and exists(select 1 from public.game_members where user_id=p_user and active)
    order by s.user_id, s.score desc, s.secondary_score desc, s.created_at
  ), ranked as (
    select *, rank() over (order by score desc, secondary_score desc) as place,
      row_number() over (order by score desc, secondary_score desc, user_id) as ordinal
    from best
  ) select user_id,display_name,score,secondary_score,place,user_id=p_user as own from ranked
    where ordinal<=20 or user_id=p_user order by place,user_id;
$$;
revoke all on function public.start_game_run(uuid,text), public.finish_game_run(uuid,uuid,integer,integer,jsonb), public.game_leaderboard(uuid,text) from public, anon, authenticated;
grant execute on function public.start_game_run(uuid,text), public.finish_game_run(uuid,uuid,integer,integer,jsonb), public.game_leaderboard(uuid,text) to service_role;
