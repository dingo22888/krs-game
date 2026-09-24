-- Add the 60-second TV racer; retain membership checks and existing grants.
begin;
alter table public.game_runs drop constraint game_runs_game_check;
alter table public.game_runs add constraint game_runs_game_check check (game in ('pong','boxing','tic-tac-toe','darts','racing'));
alter table public.game_scores drop constraint game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check check (game in ('pong','boxing','tic-tac-toe','darts','racing'));
alter table public.game_scores drop constraint game_scores_check;
alter table public.game_scores add constraint game_scores_check check (
 (game='pong' and score between 0 and 1 and secondary_score between -5 and 5)
 or (game='boxing' and score between 0 and 600 and secondary_score between score and 600)
 or (game='tic-tac-toe' and score between 0 and 30 and secondary_score=0)
 or (game='darts' and score between 0 and 540 and secondary_score=0)
 or (game='racing' and score between 0 and 2400 and secondary_score=0));
create or replace function public.start_game_run(p_user uuid, p_game text)
returns public.game_runs language plpgsql security invoker set search_path = '' as $$
declare r public.game_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if not exists (select 1 from public.game_members where user_id=p_user and active) then
    raise exception 'MEMBER_REQUIRED';
  end if;
  if p_game not in ('pong','boxing','tic-tac-toe','darts','racing') then raise exception 'INVALID_GAME'; end if;
  if (select count(*) from public.game_runs where user_id=p_user and started_at>now()-interval '1 minute') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  update public.game_runs set status='abandoned' where user_id=p_user and game=p_game and status='pending';
  insert into public.game_runs(user_id, game) values(p_user,p_game) returning * into r;
  return r;
end;
$$;

create or replace function public.finish_game_run(p_user uuid, p_run uuid, p_score integer, p_secondary integer, p_details jsonb)
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
    or (r.game='racing' and now()<r.started_at+interval '58 seconds')
    or (r.game='darts' and now()<r.started_at+interval '8 seconds')
    or (r.game='pong' and now()<r.started_at+interval '5 seconds')
    or (r.game='tic-tac-toe' and now()<r.started_at+interval '10 seconds') then raise exception 'RUN_TOO_SHORT'; end if;
  insert into public.game_scores(run_id,user_id,game,rule_version,score,secondary_score,details)
    values(r.id,p_user,r.game,r.rule_version,p_score,p_secondary,p_details) returning * into s;
  update public.game_runs set status='completed' where id=r.id;
  return s;
end;
$$;

commit;
