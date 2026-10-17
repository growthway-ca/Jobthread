-- Checks for the client project page. Runs after features_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

select share_token as stoken from public.jobs where id = '10000000-0000-0000-0000-00000000000a' \gset

set role anon;
select set_config('request.jwt.claims', '', false);
select test.check((public.get_job_by_share_token(:'stoken') ->> 'title') = 'Kitchen reno', 'project link shows the job');
select test.check(jsonb_array_length(public.get_job_by_share_token(:'stoken') -> 'changes') = 1, 'project page shows approved and waiting changes only (not void)');
select test.check((public.get_job_by_share_token(:'stoken') -> 'changes' -> 0 ->> 'approval_token') is null, 'approved changes carry no approval link');
select test.check(jsonb_array_length(public.get_job_by_share_token(:'stoken') -> 'payments') = 2, 'project page shows the payment schedule');
select test.check(jsonb_array_length(public.get_job_by_share_token(:'stoken') -> 'updates') = 1, 'project page shows daily updates');
select test.check(public.get_job_by_share_token('nope') is null, 'bad project token returns nothing');
select test.expect_error($$ select public.reset_job_share_token('10000000-0000-0000-0000-00000000000a') $$, 'anon cannot reset a project link');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.expect_error($$ select public.reset_job_share_token('10000000-0000-0000-0000-00000000000a') $$, 'B cannot reset A''s project link');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
select test.expect_error($$ update public.jobs set share_token = 'easy' $$, 'contractor cannot pick their own link token');
select public.reset_job_share_token('10000000-0000-0000-0000-00000000000a');
reset role;

set role anon;
select test.check(public.get_job_by_share_token(:'stoken') is null, 'old project link stops working after reset');
reset role;

\echo 'All client page checks passed.'
