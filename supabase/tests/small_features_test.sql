-- Checks for change details, subs, quote packages, rating and photo consent.
-- Runs after job_sheet_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.jobs (id, client_id, title, contract_cents)
  values ('10000000-0000-0000-0000-0000000000cc', 'c0000000-0000-0000-0000-00000000000a', 'Stairs', 500000);
\o
insert into public.changes (job_id, description, price_cents, reason, trade, photo_path, status)
  values ('10000000-0000-0000-0000-0000000000cc', 'Move switch', 18500,
          'found_on_site', 'Electrician', '10000000-0000-0000-0000-0000000000cc/spot.jpg', 'sent')
  returning id as cid \gset
\o /dev/null
select test.expect_error(format($$ update public.changes set reason = 'client_asked' where id = %L $$, :'cid'), 'sent change reason is locked');
select test.expect_error(format($$ update public.changes set photo_path = 'x' where id = %L $$, :'cid'), 'sent change photo is locked');
select test.expect_error(
  $$ insert into public.changes (job_id, description, price_cents, reason) values ('10000000-0000-0000-0000-0000000000cc', 'x', 1, 'because') $$,
  'reason must be one of the choices');

insert into storage.objects (bucket_id, name) values ('change-photos', '10000000-0000-0000-0000-0000000000cc/spot.jpg');
select test.expect_error($$ insert into storage.objects (bucket_id, name) values ('change-photos', 'elsewhere/x.jpg') $$, 'change photos only go in own job folders');

insert into public.subcontractors (name, trade, phone, wsib_expires_on) values ('Sparks Electric', 'Electrician', '7055550160', current_date + 12);
select test.check((select count(*) from public.subcontractors) = 1, 'A can track a sub');

update public.contractors set google_rating = 4.9, google_review_count = 37, credentials = 'Licensed and insured';
select test.expect_error($$ update public.contractors set google_rating = 7 $$, 'rating must be 1 to 5');

insert into public.quotes (id, client_id, title, base_cents, valid_until)
  values ('90000000-0000-0000-0000-0000000000ee', 'c0000000-0000-0000-0000-00000000000a', 'Basement', 0, current_date + 30);
insert into public.quote_options (id, quote_id, kind, position, title, price_cents, recommended) values
  ('9e000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000ee', 'package', 1, 'Good', 6890000, false),
  ('9e000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-0000000000ee', 'package', 2, 'Better', 7219000, true),
  ('9e000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-0000000000ee', 'addon', 3, 'Media unit', 350000, false);
update public.quotes set status = 'sent' where id = '90000000-0000-0000-0000-0000000000ee';

update public.jobs set photo_consent_at = now() where id = '10000000-0000-0000-0000-0000000000cc';
select test.check((select photo_consent_at is not null from public.jobs where id = '10000000-0000-0000-0000-0000000000cc'), 'photo consent is recorded');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.subcontractors) = 0, 'B cannot see A''s subs');
reset role;

select approval_token as ctok from public.changes where id = :'cid' \gset
select approval_token as qtok from public.quotes where id = '90000000-0000-0000-0000-0000000000ee' \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect_error($$ select * from public.subcontractors $$, 'anon cannot read subs');
select test.check((select reason from public.get_change_by_token(:'ctok')) = 'found_on_site', 'approval page shows why');
select test.check((select trade from public.get_change_by_token(:'ctok')) = 'Electrician', 'approval page shows who does it');
select test.check((public.get_quote_by_token(:'qtok') ->> 'google_rating')::numeric = 4.9, 'proposal shows the Google rating');
select test.check((public.get_quote_by_token(:'qtok') ->> 'credentials') = 'Licensed and insured', 'proposal shows credentials');
select test.expect_error(format($$ select public.accept_quote(%L, 'Jordan R', '{}') $$, :'qtok'), 'a package quote needs a package picked');
select test.expect_error(
  format($$ select public.accept_quote(%L, 'Jordan R', array['9e000000-0000-0000-0000-000000000001'::uuid, '9e000000-0000-0000-0000-000000000002'::uuid]) $$, :'qtok'),
  'only one package can be picked');
select test.check(
  (public.accept_quote(:'qtok', 'Jordan R', array['9e000000-0000-0000-0000-000000000002'::uuid, '9e000000-0000-0000-0000-000000000003'::uuid]) ->> 'status') = 'accepted',
  'client can accept one package plus add-ons');
reset role;
select test.check((select contract_cents from public.jobs j join public.quotes q on q.job_id = j.id where q.id = '90000000-0000-0000-0000-0000000000ee') = 7219000 + 350000,
  'package quote becomes a job at package plus add-ons');

\echo 'All small feature checks passed.'
