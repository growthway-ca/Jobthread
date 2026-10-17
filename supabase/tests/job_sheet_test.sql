-- Checks for job sheets. Runs after today_grow_test.sql (which marked A's
-- first job done), so this uses a fresh job.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.jobs (id, client_id, title, address, contract_cents)
  values ('10000000-0000-0000-0000-0000000000bb', 'c0000000-0000-0000-0000-00000000000a', 'Basement', '5 Moreau Way', 100000);
insert into public.job_schedule (id, job_id, title, starts_on, trade)
  values ('5c000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000bb', 'Electrical rough-in', current_date, 'Electrician');
insert into public.job_site (job_id, parking, access, access_code, heads_up, washroom)
  values ('10000000-0000-0000-0000-0000000000bb', 'Left side of the driveway', 'Lockbox on the side door', '4821',
          E'Cat in the house\nQuiet 1 to 3', 'Main-floor powder room');
insert into public.job_sheets (id, job_id, trade_name, trade_phone, schedule_item_id)
  values ('5d000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000bb', 'Sparks Electric', '7055550160',
          '5c000000-0000-0000-0000-000000000001');
select test.check((select count(*) from public.job_sheets) = 1, 'A can make a job sheet');
select test.expect_error(
  $$ insert into public.job_sheets (job_id, trade_name, schedule_item_id)
     values ('10000000-0000-0000-0000-00000000000a', 'x', '5c000000-0000-0000-0000-000000000001') $$,
  'a sheet cannot point at another job''s schedule');
select test.expect_error($$ update public.job_sheets set token = 'easy' $$, 'contractor cannot pick the sheet link');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.job_site) = 0, 'B cannot see A''s site info or lockbox code');
select test.check((select count(*) from public.job_sheets) = 0, 'B cannot see A''s sheets');
select test.expect_error(
  $$ insert into public.job_sheets (job_id, trade_name) values ('10000000-0000-0000-0000-0000000000bb', 'x') $$,
  'B cannot make a sheet for A''s job');
reset role;

select token as stok from public.job_sheets where id = '5d000000-0000-0000-0000-000000000001' \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect_error($$ select * from public.job_site $$, 'anon cannot read site info');
select test.check((public.get_job_sheet(:'stok') ->> 'washroom') = 'Main-floor powder room', 'sheet shows site info');
select test.check((public.get_job_sheet(:'stok') ->> 'title') = 'Electrical rough-in', 'sheet takes its title from the schedule');
select test.check((public.get_job_sheet(:'stok') ->> 'access_code') is null, 'sheet never includes the lockbox code');
select test.check((public.get_job_sheet(:'stok') ->> 'has_code')::boolean, 'sheet says there is a code');
select test.expect_error(format($$ select public.reveal_access_code(%L, '') $$, :'stok'), 'revealing the code needs a name');
select test.check(public.reveal_access_code(:'stok', 'Dave Sparks') = '4821', 'trade can reveal the code with their name');
select test.check(public.get_job_sheet('nope') is null, 'bad sheet token returns nothing');
reset role;

select test.check((select count(*) from public.job_sheet_views where kind = 'opened') = 1, 'opens are logged once per visit');
select test.check((select viewer_name from public.job_sheet_views where kind = 'code') = 'Dave Sparks', 'code views are logged with the name');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
update public.job_sheets set closed_at = now() where id = '5d000000-0000-0000-0000-000000000001';
reset role;

set role anon;
select test.check((public.get_job_sheet(:'stok') ->> 'closed')::boolean, 'closed sheet says it is closed');
select test.check((public.get_job_sheet(:'stok') ->> 'address') is null, 'closed sheet hides the address');
select test.expect_error(format($$ select public.reveal_access_code(%L, 'Dave') $$, :'stok'), 'closed sheet cannot reveal the code');
reset role;

-- Finishing the job closes every sheet too.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
update public.job_sheets set closed_at = null where id = '5d000000-0000-0000-0000-000000000001';
update public.jobs set status = 'done' where id = '10000000-0000-0000-0000-0000000000bb';
reset role;
set role anon;
select test.check((public.get_job_sheet(:'stok') ->> 'closed')::boolean, 'sheets close when the job is done');
reset role;

\echo 'All job sheet checks passed.'
