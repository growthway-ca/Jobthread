-- Checks for texts to the client logged on the job thread.
-- Runs after small_features_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.job_events (job_id, kind, body)
  values ('10000000-0000-0000-0000-0000000000cc', 'message_sent', 'Flooring options: LVP in Oak or Ash, samples Tuesday.');
select test.check(
  (select count(*) from public.job_events where job_id = '10000000-0000-0000-0000-0000000000cc' and kind = 'message_sent') = 1,
  'A can log a text to the client');
select test.expect_error(
  $$ insert into public.job_events (job_id, kind, body) values ('10000000-0000-0000-0000-0000000000cc', 'change_approved', 'x') $$,
  'contractors still cannot forge other event kinds');
select test.expect_error(
  $$ update public.job_events set body = 'edited' where kind = 'message_sent' $$,
  'logged texts cannot be edited');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.expect_error(
  $$ insert into public.job_events (job_id, kind, body) values ('10000000-0000-0000-0000-0000000000cc', 'message_sent', 'x') $$,
  'B cannot log a text on A''s job');
select test.check((select count(*) from public.job_events where kind = 'message_sent') = 0, 'B cannot see A''s texts');
reset role;

\o
\echo 'All client message checks passed.'
