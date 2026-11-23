-- Checks for stages the contractor marks done.
-- Runs after live_quotes_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.job_schedule (job_id, title, starts_on, visible_to_client)
  values ('10000000-0000-0000-0000-0000000000cc', 'Framing', current_date - 5, true)
  returning id as frame_id \gset
update public.job_schedule set done_on = current_date - 1 where id = :'frame_id';
select test.check((select done_on = current_date - 1 from public.job_schedule where id = :'frame_id'), 'A can mark a stage done with its date');
select test.check(
  (select count(*) from public.job_events where kind = 'stage_done' and body like 'Done: Framing (%') = 1,
  'the thread logs the stage');
update public.job_schedule set done_on = current_date where id = :'frame_id';
select test.check((select count(*) from public.job_events where kind = 'stage_done') = 1, 'changing the date doesn''t log it twice');
update public.job_schedule set done_on = null where id = :'frame_id';
update public.job_schedule set done_on = current_date - 1 where id = :'frame_id';
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
update public.job_schedule set done_on = null where id = :'frame_id';
reset role;
select test.check((select done_on is not null from public.job_schedule where id = :'frame_id'), 'B can''t change A''s stages');

select share_token as jtok from public.jobs where id = '10000000-0000-0000-0000-0000000000cc' \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.check(
  (select count(*) from jsonb_array_elements(public.get_job_by_share_token(:'jtok') -> 'schedule') s
    where s ->> 'title' = 'Framing' and (s ->> 'done_on')::date = current_date - 1) = 1,
  'the client page shows when the stage was done');
select test.expect_error($$ select private.stage_done_event() $$, 'the trigger function can''t be called directly');
reset role;

\o
\echo 'All stage checks passed.'
