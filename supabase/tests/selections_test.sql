-- Checks for selections (paint, flooring and other picks).
-- Runs after shutoffs_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.job_selections (job_id, category, brand, name, code, finish, location)
  values ('10000000-0000-0000-0000-0000000000cc', 'paint', 'Benjamin Moore', 'Chantilly Lace', 'OC-65', 'Eggshell', 'Living room walls')
  returning id as paint_id \gset
insert into public.job_selections (job_id, category, brand, name, color, location)
  values ('10000000-0000-0000-0000-0000000000cc', 'flooring', 'Torlys', 'Everest Elite', 'Natural Oak', 'Whole basement')
  returning id as floor_id \gset
select test.check((select count(*) from public.job_selections) = 2, 'A can add selections');
select test.expect_error(
  $$ insert into public.job_selections (job_id, category, name) values ('10000000-0000-0000-0000-0000000000cc', 'roof', 'x') $$,
  'category must be one of the choices');
select test.expect_error(
  $$ update public.job_selections set confirmed_name = 'Me', confirmed_at = now() $$,
  'the contractor can''t confirm on the client''s behalf');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.job_selections) = 0, 'B can''t see A''s selections');
select test.expect_error(
  $$ insert into public.job_selections (job_id, category, name) values ('10000000-0000-0000-0000-0000000000cc', 'paint', 'x') $$,
  'B can''t add a selection to A''s job');
reset role;

select share_token as jtok from public.jobs where id = '10000000-0000-0000-0000-0000000000cc' \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.check(
  (select count(*) from jsonb_array_elements(public.get_job_by_share_token(:'jtok') -> 'selections') s
    where s ->> 'code' = 'OC-65' and s ->> 'confirmed_at' is null) = 1,
  'client page shows the paint code, not yet confirmed');
select test.expect_error(format($$ select public.confirm_selections(%L, ' ', array[%L::uuid]) $$, :'jtok', :'paint_id'),
  'confirming needs a name');
select test.expect_error(format($$ select public.confirm_selections(%L, 'Matt P.', array[%L::uuid]) $$, repeat('x', 32), :'paint_id'),
  'a wrong link can''t confirm');
select test.check(public.confirm_selections(:'jtok', 'Matt  P.', array[:'paint_id', :'floor_id']::uuid[]) = 2, 'the client confirms both');
select test.check(public.confirm_selections(:'jtok', 'Matt P.', array[:'paint_id']::uuid[]) = 0, 'confirming again does nothing');
reset role;

select test.check(
  (select confirmed_name from public.job_selections where id = :'paint_id') = 'Matt P.', 'the typed name is saved, tidied');
select test.check(
  (select count(*) from public.job_events where kind = 'selections_confirmed' and body like 'Matt P. confirmed 2 selections:%') = 1,
  'the thread logs the confirmation');

-- A real change clears the confirmation; touching nothing else keeps it.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
update public.job_selections set code = 'OC-17' where id = :'paint_id';
update public.job_selections set name = name where id = :'floor_id';
insert into public.job_sheets (job_id, trade_name) values ('10000000-0000-0000-0000-0000000000cc', 'Brush Bros') returning token as stok \gset
reset role;
select test.check((select confirmed_at is null from public.job_selections where id = :'paint_id'), 'changing the code clears the confirmation');
select test.check((select confirmed_at is not null from public.job_selections where id = :'floor_id'), 'saving with no change keeps it');

set role anon;
select set_config('request.jwt.claims', '', false);
select test.check(
  (select count(*) from jsonb_array_elements(public.get_job_sheet(:'stok') -> 'selections') s where s ->> 'code' = 'OC-17') = 1,
  'the job sheet shows the selections to the trade');
reset role;

\o
\echo 'All selection checks passed.'
