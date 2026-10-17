-- Checks for the schedule, quote views, leads, referrals and reviews.
-- Runs after client_page_test.sql.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- ---------------------------------------------------------------- schedule (A)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
insert into public.job_schedule (job_id, title, starts_on, ends_on, trade)
  values ('10000000-0000-0000-0000-00000000000a', 'Electrical rough-in', current_date, current_date + 2, 'Electrician');
insert into public.job_schedule (job_id, title, starts_on, visible_to_client)
  values ('10000000-0000-0000-0000-00000000000a', 'Internal: order cabinets', current_date + 5, false);
select test.check((select count(*) from public.job_schedule) = 2, 'A can schedule work');
select test.expect_error(
  $$ insert into public.job_schedule (job_id, title, starts_on, ends_on)
     values ('10000000-0000-0000-0000-00000000000a', 'x', current_date, current_date - 1) $$,
  'schedule end cannot be before its start');
update public.jobs set status = 'done' where id = '10000000-0000-0000-0000-00000000000a';
select test.check((select done_at is not null from public.jobs where id = '10000000-0000-0000-0000-00000000000a'), 'marking a job done stamps done_at');
update public.jobs set review_asked_at = now() where id = '10000000-0000-0000-0000-00000000000a';
select test.check((select review_asked_at is not null from public.jobs where id = '10000000-0000-0000-0000-00000000000a'), 'review requests are tracked');
select test.expect_error($$ update public.jobs set done_at = null $$, 'done_at is set by the server only');
insert into public.leads (name, phone, project) values ('Walk-in', '7055550111', 'Deck');
select test.check((select source from public.leads) = 'manual', 'hand-added leads are manual');
select test.expect_error($$ insert into public.leads (name, source) values ('x', 'referral') $$, 'contractor cannot fake a referral');
reset role;

-- ---------------------------------------------------------------- B can't see A's
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
select test.check((select count(*) from public.job_schedule) = 0, 'B cannot see A''s schedule');
select test.check((select count(*) from public.leads) = 0, 'B cannot see A''s leads');
select test.check((select count(*) from public.quote_views) = 0, 'B cannot see A''s quote views');
select test.expect_error(
  $$ insert into public.job_schedule (job_id, title, starts_on) values ('10000000-0000-0000-0000-00000000000a', 'x', current_date) $$,
  'B cannot schedule on A''s job');
reset role;

-- ---------------------------------------------------------------- the public (anon)
select share_token as stoken from public.jobs where id = '10000000-0000-0000-0000-00000000000a' \gset
select referral_token as rtoken from public.clients where id = 'c0000000-0000-0000-0000-00000000000a' \gset
select approval_token as qtoken from public.quotes where status = 'sent' limit 1 \gset

set role anon;
select set_config('request.jwt.claims', '', false);
select test.check(jsonb_array_length(public.get_job_by_share_token(:'stoken') -> 'schedule') = 1, 'client page shows only client-visible schedule items');
select public.record_quote_view(:'qtoken');
select public.record_quote_view(:'qtoken');
select test.expect_error($$ select * from public.quote_views $$, 'anon cannot read quote views');
select test.check((public.get_referral_page(:'rtoken') ->> 'referrer_first_name') = 'Sarah', 'referral page names the referrer');
select test.check(public.get_referral_page('nope') is null, 'bad referral token returns nothing');
select test.check(public.submit_referral(:'rtoken', 'Dana M.', '705-555-0148', 'Deck repair'), 'a friend can ask for a quote');
select test.expect_error(format($$ select public.submit_referral(%L, '', '705', '') $$, :'rtoken'), 'referral needs a name and phone');
select test.expect_error($$ select * from public.leads $$, 'anon cannot read leads');
reset role;

select test.check((select count(*) from public.quote_views) = 1, 'reloads within two minutes count as one view');
select test.check((select count(*) from public.leads where source = 'referral' and referred_by_client_id = 'c0000000-0000-0000-0000-00000000000a') = 1, 'referral lands as a lead for the right contractor');

select set_config('test.rtoken', :'rtoken', false);
set role anon;
do $$
begin
  for i in 1..9 loop
    perform public.submit_referral(current_setting('test.rtoken'), 'Spam', '7055550000', null);
  end loop;
exception when others then null;
end $$;
reset role;
set role anon;
select test.expect_error(format($$ select public.submit_referral(%L, 'One more', '7055550000', null) $$, :'rtoken'), 'referral links are capped at 10 a day');
reset role;

\echo 'All Today and Grow checks passed.'
