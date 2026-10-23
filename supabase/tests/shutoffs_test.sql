-- Checks for planned shutoffs on the schedule.
-- Runs after signup_alert_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.job_schedule (job_id, title, starts_on, utility, from_time, to_time, note, visible_to_client)
  values ('10000000-0000-0000-0000-0000000000cc', 'Water off', current_date + 1, 'water', '09:00', '11:00', 'Vanity swap', true);
select test.check((select count(*) from public.job_schedule where utility = 'water') = 1, 'A can schedule a shutoff');
select test.expect_error(
  $$ insert into public.job_schedule (job_id, title, starts_on, utility) values ('10000000-0000-0000-0000-0000000000cc', 'x', current_date, 'cable') $$,
  'utility must be one of the choices');
select test.expect_error(
  $$ insert into public.job_schedule (job_id, title, starts_on, utility, from_time, to_time) values ('10000000-0000-0000-0000-0000000000cc', 'x', current_date, 'power', '11:00', '09:00') $$,
  'a shutoff can''t end before it starts');
insert into public.job_sheets (job_id, trade_name) values ('10000000-0000-0000-0000-0000000000cc', 'Northway Plumbing') returning token as stok \gset
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.expect_error(
  $$ insert into public.job_schedule (job_id, title, starts_on, utility) values ('10000000-0000-0000-0000-0000000000cc', 'x', current_date, 'gas') $$,
  'B cannot add a shutoff to A''s job');
reset role;

select share_token as jtok from public.jobs where id = '10000000-0000-0000-0000-0000000000cc' \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.check(
  (select count(*) from jsonb_array_elements(public.get_job_by_share_token(:'jtok') -> 'schedule') s
    where s ->> 'utility' = 'water' and s ->> 'from_time' = '09:00:00') = 1,
  'client page shows the shutoff and its time');
select test.check(
  (select count(*) from jsonb_array_elements(public.get_job_sheet(:'stok') -> 'shutoffs') s where s ->> 'utility' = 'water') = 1,
  'job sheet lists upcoming shutoffs for the trade');
reset role;

\o
\echo 'All shutoff checks passed.'
