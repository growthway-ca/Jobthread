-- Checks for live quotes: photos, choice groups, picks, signatures, alerts.
-- Runs after selections_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.quotes (id, client_id, title, base_cents, deposit_rate, valid_until)
  values ('91000000-0000-0000-0000-0000000000ff', 'c0000000-0000-0000-0000-00000000000a', 'Kitchen window', 82000, 0.2, current_date + 30);
insert into public.quote_options (id, quote_id, kind, group_name, swatch, position, title, price_cents, recommended) values
  ('9f000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-0000000000ff', 'choice', 'Frame', null, 1, 'Aluminium', 0, true),
  ('9f000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-0000000000ff', 'choice', 'Frame', null, 2, 'PVC', 16000, false),
  ('9f000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-0000000000ff', 'choice', 'Colour', '#3B4148', 3, 'Anthracite grey', 0, true),
  ('9f000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-0000000000ff', 'choice', 'Colour', '#FFFFFF', 4, 'Traffic white', 0, false),
  ('9f000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-0000000000ff', 'addon', null, null, 5, 'Roller shutter', 29000, false);
select test.expect_error(
  $$ insert into public.quote_options (quote_id, kind, title, price_cents) values ('91000000-0000-0000-0000-0000000000ff', 'choice', 'x', 0) $$,
  'a choice needs a group');
select test.expect_error(
  $$ insert into public.quote_options (quote_id, kind, group_name, title, price_cents) values ('91000000-0000-0000-0000-0000000000ff', 'addon', 'Frame', 'x', 0) $$,
  'only choices have a group');
select test.expect_error(
  $$ insert into public.quote_options (quote_id, kind, group_name, swatch, title, price_cents) values ('91000000-0000-0000-0000-0000000000ff', 'choice', 'Colour', 'red', 'x', 0) $$,
  'a swatch is a hex colour');

insert into storage.objects (bucket_id, name) values ('quote-photos', '91000000-0000-0000-0000-0000000000ff/outside.jpg');
select test.expect_error($$ insert into storage.objects (bucket_id, name) values ('quote-photos', 'elsewhere/x.jpg') $$,
  'quote photos only go in own quote folders');
insert into public.quote_photos (quote_id, storage_path, label, position)
  values ('91000000-0000-0000-0000-0000000000ff', '91000000-0000-0000-0000-0000000000ff/outside.jpg', 'Outside', 1);
select test.expect_error(
  $$ insert into public.quote_photos (quote_id, storage_path) values ('91000000-0000-0000-0000-0000000000ff', 'other/x.jpg') $$,
  'a quote photo lives in its quote''s folder');
update public.contractors set quote_alerts = false;
update public.contractors set quote_alerts = true;
update public.quotes set status = 'sent' where id = '91000000-0000-0000-0000-0000000000ff';
select test.expect_error($$ update public.quotes set accepted_signature = 'M 1 1' $$, 'the contractor can''t sign for the client');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.expect_error(
  $$ insert into public.quote_photos (quote_id, storage_path) values ('91000000-0000-0000-0000-0000000000ff', '91000000-0000-0000-0000-0000000000ff/b.jpg') $$,
  'B can''t add photos to A''s quote');
select test.expect_error($$ insert into storage.objects (bucket_id, name) values ('quote-photos', '91000000-0000-0000-0000-0000000000ff/b.jpg') $$,
  'B can''t upload into A''s quote folder');
reset role;

select approval_token as ltok from public.quotes where id = '91000000-0000-0000-0000-0000000000ff' \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.check((public.get_quote_by_token(:'ltok') -> 'photos' -> 0 ->> 'label') = 'Outside', 'proposal shows the photos');
select test.check(
  (select count(*) from jsonb_array_elements(public.get_quote_by_token(:'ltok') -> 'options') o
    where o ->> 'group_name' = 'Colour' and o ->> 'swatch' = '#3B4148') = 1,
  'proposal shows choice groups and swatches');
select test.check((public.get_quote_by_token(:'ltok') ->> 'contractor_name') is not null, 'proposal names the contractor');
select public.record_quote_view(:'ltok');
select public.record_quote_pick(:'ltok', '9f000000-0000-0000-0000-000000000002', true, 110740);
select public.record_quote_pick(:'ltok', '9f000000-0000-0000-0000-000000000005', true, 143510);
select public.record_quote_pick(:'ltok', '9e000000-0000-0000-0000-000000000003', true, 1);  -- another quote's option
select public.record_quote_pick(repeat('x', 32), '9f000000-0000-0000-0000-000000000002', true, 1);
select test.expect_error($$ select * from public.quote_events $$, 'anon can''t read the picks');
select test.expect_error(format($$ select public.accept_quote(%L, 'Sarah Lee', array['9f000000-0000-0000-0000-000000000002'::uuid], 'M 10 10 L 20 20') $$, :'ltok'),
  'every choice group needs a pick');
select test.expect_error(
  format($$ select public.accept_quote(%L, 'Sarah Lee', array['9f000000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-000000000002', '9f000000-0000-0000-0000-000000000003']::uuid[], 'M 10 10') $$, :'ltok'),
  'only one pick per choice group');
select test.expect_error(
  format($$ select public.accept_quote(%L, 'Sarah Lee', array['9f000000-0000-0000-0000-000000000002', '9f000000-0000-0000-0000-000000000003']::uuid[], '<script>') $$, :'ltok'),
  'a signature is path data only');
select test.check(
  (public.accept_quote(:'ltok', 'Sarah Lee',
     array['9f000000-0000-0000-0000-000000000002', '9f000000-0000-0000-0000-000000000003', '9f000000-0000-0000-0000-000000000005']::uuid[],
     'M 10 60 Q 40 10 80 50 L 120 40') ->> 'accepted_signature') = 'M 10 60 Q 40 10 80 50 L 120 40',
  'the client signs with a finger and the page shows it');
select public.record_quote_pick(:'ltok', '9f000000-0000-0000-0000-000000000004', true, 1);  -- after signing: ignored
reset role;

select test.check((select contract_cents from public.jobs j join public.quotes q on q.job_id = j.id
                   where q.id = '91000000-0000-0000-0000-0000000000ff') = 82000 + 16000 + 29000,
  'the job is the base plus the picks');
select test.check((select count(*) from public.job_events where body like 'Quote #% signed by Sarah Lee%') = 1, 'the thread says signed');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
select test.check(
  (select string_agg(kind || ' ' || title || ' ' || coalesce(total_cents::text, '-'), ', ' order by created_at)
   from public.quote_events where quote_id = '91000000-0000-0000-0000-0000000000ff')
  = 'picked Frame: PVC 110740, picked Roller shutter 143510',
  'A sees what the client tapped, and nothing from other quotes or after signing');
select test.check((select count(*) from public.quote_photos) = 1, 'A sees their quote photos');
select test.expect_error($$ select private.quote_alert('91000000-0000-0000-0000-0000000000ff', 'x', 'y') $$, 'users can''t send alerts themselves');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.quote_events) = 0, 'B can''t see A''s quote activity');
select test.check((select count(*) from public.quote_photos) = 0, 'B can''t see A''s quote photos');
reset role;

\o
\echo 'All live quote checks passed.'
