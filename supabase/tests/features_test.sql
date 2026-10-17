-- Checks for daily logs, photos, payments, holdbacks and quotes.
-- Runs after security_test.sql and reuses its users, job and test helpers.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- ---------------------------------------------------------------- daily logs and photos (A)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);

\o
insert into public.job_events (job_id, kind, body)
  values ('10000000-0000-0000-0000-00000000000a', 'daily_log', 'Drywall done.') returning id as log_id \gset
\o /dev/null
insert into storage.objects (bucket_id, name)
  values ('job-photos', '10000000-0000-0000-0000-00000000000a/one.jpg');
insert into public.job_photos (job_id, event_id, storage_path, width, height)
  values ('10000000-0000-0000-0000-00000000000a', :'log_id',
          '10000000-0000-0000-0000-00000000000a/one.jpg', 1600, 1200);
select test.check((select count(*) from public.job_photos) = 1, 'A can add a photo to a daily log');

select test.expect_error(
  $$ insert into public.job_events (job_id, kind, body)
     values ('10000000-0000-0000-0000-00000000000a', 'payment_received', 'fake') $$,
  'contractor cannot forge a payment event');
select test.expect_error(
  $$ insert into public.job_photos (job_id, event_id, storage_path)
     values ('10000000-0000-0000-0000-00000000000a', :'log_id', 'elsewhere/two.jpg') $$,
  'photo path must sit in the job''s folder');
select test.expect_error(
  $$ insert into storage.objects (bucket_id, name) values ('job-photos', 'not-a-job/x.jpg') $$,
  'cannot upload outside a job folder');
select test.expect_error($$ update public.job_events set body = 'edited' where kind = 'daily_log' $$, 'daily logs cannot be edited');

-- ---------------------------------------------------------------- payments (A)
insert into public.payment_milestones (id, job_id, title, amount_cents, due_note)
  values ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Deposit', 250000, 'On signing');
insert into public.payment_milestones (id, job_id, title, amount_cents)
  values ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'Rough-in', 500000);
select test.check((select array_agg(position order by position) from public.payment_milestones) = '{1,2}', 'payments are numbered per job');
select test.expect_error(
  $$ insert into public.payment_milestones (job_id, title, amount_cents, status)
     values ('10000000-0000-0000-0000-00000000000a', 'x', 1, 'paid') $$,
  'a new payment cannot start as paid');

update public.payment_milestones set status = 'requested' where id = 'a1000000-0000-0000-0000-000000000001';
select test.check((select requested_at is not null from public.payment_milestones where position = 1), 'requesting stamps server time');
select test.check((select count(*) from public.job_events where kind = 'payment_requested') = 1, 'payment request is logged');
select test.expect_error($$ update public.payment_milestones set amount_cents = 1 where position = 1 $$, 'requested amount is locked');
select test.expect_error($$ update public.payment_milestones set status = 'paid' where position = 1 $$, 'marking paid needs a method');
update public.payment_milestones set status = 'paid', paid_method = 'etransfer' where position = 1;
select test.check((select paid_at is not null from public.payment_milestones where position = 1), 'paid stamps server time');
select test.check((select count(*) from public.job_events where kind = 'payment_received') = 1, 'payment received is logged');
select test.expect_error($$ update public.payment_milestones set status = 'upcoming' where position = 1 $$, 'paid is final');
select test.expect_error($$ delete from public.payment_milestones where position = 1 $$, 'paid payments cannot be deleted');
update public.payment_milestones set amount_cents = 450000 where position = 2;
select test.check((select amount_cents from public.payment_milestones where position = 2) = 450000, 'upcoming payments can be edited');

update public.jobs set holdback_rate = 0.10, holdback_release_date = '2027-01-15';
select test.check((select holdback_rate from public.jobs) = 0.10, 'holdback can be set');
reset role;

-- ---------------------------------------------------------------- B can't reach A's new data
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.payment_milestones) = 0, 'B cannot see A''s payments');
select test.check((select count(*) from public.job_photos) = 0, 'B cannot see A''s photos');
select test.check((select count(*) from storage.objects) = 0, 'B cannot see A''s photo files');
select test.expect_error(
  $$ insert into public.payment_milestones (job_id, title, amount_cents)
     values ('10000000-0000-0000-0000-00000000000a', 'sneaky', 1) $$,
  'B cannot add a payment to A''s job');
select test.expect_error(
  $$ insert into storage.objects (bucket_id, name) values ('job-photos', '10000000-0000-0000-0000-00000000000a/b.jpg') $$,
  'B cannot upload into A''s job folder');
update public.payment_milestones set status = 'requested';
reset role;
select test.check((select status from public.payment_milestones where position = 2) = 'upcoming', 'B''s update did not touch A''s payments');

-- ---------------------------------------------------------------- quotes (A)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.quotes (id, client_id, title, address, scope, base_cents, deposit_rate, valid_until)
  values ('90000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Basement finish',
          '12 Elm St', E'Framing\nDrywall', 7219000, 0.05, current_date + 30);
insert into public.quote_options (id, quote_id, position, title, price_cents, recommended) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-00000000000a', 1, 'Insulated subfloor', 665000, true),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-00000000000a', 2, 'Media unit', 350000, false);
select test.check((select number from public.quotes) = 1001, 'quotes are numbered per contractor');
update public.quote_options set price_cents = 660000 where position = 1;

update public.quotes set status = 'sent';
select test.check((select sent_at is not null from public.quotes), 'sending stamps server time');
select test.expect_error($$ update public.quotes set base_cents = 1 $$, 'sent quote is locked');
select test.expect_error($$ update public.quote_options set price_cents = 1 $$, 'sent quote options are locked');
select test.expect_error(
  $$ insert into public.quote_options (quote_id, title, price_cents) values ('90000000-0000-0000-0000-00000000000a', 'x', 1) $$,
  'cannot add options to a sent quote');
select test.expect_error($$ update public.quotes set status = 'accepted' $$, 'contractor cannot accept their own quote');
select test.expect_error($$ update public.quote_options set selected = true $$, 'contractor cannot pick options for the client');
select test.expect_error($$ delete from public.quotes $$, 'sent quotes cannot be deleted');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.quotes) = 0, 'B cannot see A''s quotes');
select test.check((select count(*) from public.quote_options) = 0, 'B cannot see A''s quote options');
select test.expect_error(
  $$ insert into public.quotes (client_id, title) values ('c0000000-0000-0000-0000-00000000000a', 'sneaky') $$,
  'B cannot quote A''s client');
reset role;

-- ---------------------------------------------------------------- the client accepts (anon)
select approval_token as qtoken from public.quotes \gset
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect_error($$ select * from public.quotes $$, 'anon cannot read the quotes table');
select test.check((public.get_quote_by_token(:'qtoken') ->> 'title') = 'Basement finish', 'proposal link shows the quote');
select test.check(jsonb_array_length(public.get_quote_by_token(:'qtoken') -> 'options') = 2, 'proposal link shows the options');
select test.check(public.get_quote_by_token('nope') is null, 'bad proposal token returns nothing');
select test.expect_error(format($$ select public.accept_quote(%L, '', '{}') $$, :'qtoken'), 'acceptance needs a name');

select test.check(
  (public.accept_quote(:'qtoken', 'Jordan Reyes', array['91000000-0000-0000-0000-000000000001'::uuid,
                                                         '99999999-0000-0000-0000-000000000000'::uuid]) ->> 'status') = 'accepted',
  'client can accept with options');
select test.check(
  (public.accept_quote(:'qtoken', 'Someone Else', '{}') ->> 'accepted_name') = 'Jordan Reyes',
  'second acceptance does not overwrite the first');
reset role;

select test.check((select contract_cents from public.jobs j join public.quotes q on q.job_id = j.id) = 7219000 + 660000,
  'accepted quote becomes a job priced at base plus picked options');
select test.check((select bool_and(selected = (position = 1)) from public.quote_options), 'only the picked options are marked selected');
select test.check(
  (select amount_cents from public.payment_milestones m join public.quotes q on q.job_id = m.job_id) = round((7219000 + 660000) * 0.05),
  'accepting creates the booking deposit');
select test.check(
  (select count(*) from public.job_events e join public.quotes q on q.job_id = e.job_id where e.kind = 'quote_accepted') = 1,
  'acceptance is logged on the new job');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
select test.check((select count(*) from public.jobs) = 2, 'A sees the job created from the quote');
select test.expect_error($$ update public.quotes set status = 'lost' $$, 'accepted quote is final');
reset role;

-- A withdrawn quote stops working; an expired one can't be accepted.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.quotes (id, client_id, title, base_cents, status, valid_until)
  values ('90000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000a', 'Deck', 100000, 'sent', current_date + 30);
insert into public.quotes (id, client_id, title, base_cents, status, valid_until)
  values ('90000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000a', 'Fence', 100000, 'sent', current_date - 2);
update public.quotes set status = 'withdrawn' where id = '90000000-0000-0000-0000-00000000000b';
insert into public.quotes (id, client_id, title, status)
  values ('90000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-00000000000a', 'Draft to bin', 'draft');
insert into public.quote_options (quote_id, title, price_cents) values ('90000000-0000-0000-0000-00000000000d', 'x', 1);
delete from public.quotes where id = '90000000-0000-0000-0000-00000000000d';
select test.check((select count(*) from public.quotes where id = '90000000-0000-0000-0000-00000000000d') = 0, 'draft quotes can be deleted');
reset role;

select approval_token as wtoken from public.quotes where id = '90000000-0000-0000-0000-00000000000b' \gset
select approval_token as etoken from public.quotes where id = '90000000-0000-0000-0000-00000000000c' \gset
set role anon;
select test.check((public.get_quote_by_token(:'wtoken') ->> 'title') is null, 'withdrawn link hides details');
select test.expect_error(format($$ select public.accept_quote(%L, 'Jordan', '{}') $$, :'wtoken'), 'withdrawn quote cannot be accepted');
select test.check((public.get_quote_by_token(:'etoken') ->> 'expired')::boolean, 'expired quote says so');
select test.expect_error(format($$ select public.accept_quote(%L, 'Jordan', '{}') $$, :'etoken'), 'expired quote cannot be accepted');
reset role;

\echo 'All feature checks passed.'
