-- Security and immutability checks for the JobThread schema.
-- Run with scripts/test-db.sh. Any failed check stops the script.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema test;
grant usage on schema test to anon, authenticated;

-- Expect a statement to fail. Usage: select test.expect_error($$ sql $$, 'label');
create function test.expect_error(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   - % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL - % : statement succeeded but should have failed', p_label;
end;
$$;
grant execute on function test.expect_error(text, text) to anon, authenticated;

create function test.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL - %', p_label;
  end if;
  raise notice 'ok   - %', p_label;
end;
$$;
grant execute on function test.check(boolean, text) to anon, authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');

-- ---------------------------------------------------------------- contractor A
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);

insert into public.contractors (name, business_name, phone) values ('Braeden', 'Braeden Renovations', '705-555-0100');
insert into public.clients (id, name, phone) values ('c0000000-0000-0000-0000-00000000000a', 'Sarah Lee', '705-555-0199');
insert into public.jobs (id, client_id, title, address, contract_cents)
  values ('10000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Kitchen reno', '12 Elm St', 2500000);

insert into public.changes (job_id, description, price_cents, time_added, status)
  values ('10000000-0000-0000-0000-00000000000a', 'Add pot lights', 85000, 'Half a day', 'sent');
insert into public.changes (job_id, description, price_cents, time_added, status)
  values ('10000000-0000-0000-0000-00000000000a', 'Move the sink', 120000, '1 day', 'sent');
insert into public.job_events (job_id, kind, body) values ('10000000-0000-0000-0000-00000000000a', 'note', 'Demo starts Monday');

select test.check((select array_agg(number order by number) from public.changes) = '{1,2}', 'changes are numbered per job');
select test.check((select bool_and(sent_at is not null) from public.changes), 'sent_at is set by the server');
select test.check((select count(*) from public.job_events where kind = 'change_sent') = 2, 'sending logs a change_sent event');

select test.expect_error($$ update public.changes set price_cents = 1 where number = 1 $$, 'sent change price is locked');
select test.expect_error($$ update public.changes set description = 'x' where number = 1 $$, 'sent change description is locked');
select test.expect_error($$ update public.changes set status = 'approved' where number = 1 $$, 'contractor cannot approve their own change');
select test.expect_error($$ update public.changes set approved_name = 'Me' where number = 1 $$, 'contractor cannot write approval fields');
select test.expect_error($$ update public.changes set approval_token = 'x' where number = 1 $$, 'contractor cannot change the token');
select test.expect_error(
  $$ insert into public.changes (job_id, description, price_cents, status)
     values ('10000000-0000-0000-0000-00000000000a', 'x', 1, 'approved') $$,
  'contractor cannot insert an approved change');
select test.expect_error(
  $$ insert into public.job_events (job_id, kind, body)
     values ('10000000-0000-0000-0000-00000000000a', 'change_approved', 'fake') $$,
  'contractor cannot forge an approval event');
select test.expect_error($$ update public.job_events set body = 'edited' $$, 'job log cannot be edited');
delete from public.changes where number = 1;
reset role;
select test.check((select count(*) from public.changes) = 2, 'sent changes cannot be deleted');

-- ---------------------------------------------------------------- contractor B
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
insert into public.contractors (name, business_name, phone) values ('Other', 'Other Co', '705-555-0200');

select test.check((select count(*) from public.jobs) = 0, 'B cannot see A''s jobs');
select test.check((select count(*) from public.clients) = 0, 'B cannot see A''s clients');
select test.check((select count(*) from public.changes) = 0, 'B cannot see A''s changes');
select test.check((select count(*) from public.job_events) = 0, 'B cannot see A''s job log');
select test.check((select count(*) from public.contractors) = 1, 'B sees only their own profile');

select test.expect_error(
  $$ insert into public.changes (job_id, description, price_cents, status)
     values ('10000000-0000-0000-0000-00000000000a', 'sneaky', 1, 'sent') $$,
  'B cannot add a change to A''s job');
select test.expect_error(
  $$ insert into public.job_events (job_id, kind, body) values ('10000000-0000-0000-0000-00000000000a', 'note', 'sneaky') $$,
  'B cannot add a note to A''s job');
select test.expect_error(
  $$ insert into public.jobs (client_id, title) values ('c0000000-0000-0000-0000-00000000000a', 'sneaky') $$,
  'B cannot make a job for A''s client');
select test.expect_error(
  $$ insert into public.contractors (id, name, business_name, phone)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'x', '7055550000') $$,
  'B cannot create a profile for A');

update public.changes set status = 'void';
update public.jobs set title = 'hacked';
reset role;
select test.check((select count(*) from public.changes where status = 'void') = 0, 'B''s update did not touch A''s changes');
select test.check((select title from public.jobs) = 'Kitchen reno', 'B''s update did not touch A''s job');

-- ---------------------------------------------------------------- the client (anon)
select approval_token as token1 from public.changes where number = 1 \gset
select approval_token as token2 from public.changes where number = 2 \gset
select set_config('request.headers', '{"user-agent":"Mozilla/5.0 (iPhone) Test"}', false);

set role anon;
select set_config('request.jwt.claims', '', false);

select test.expect_error($$ select * from public.changes $$, 'anon cannot read the changes table');
select test.expect_error($$ select * from public.jobs $$, 'anon cannot read the jobs table');
select test.expect_error($$ select * from public.contractors $$, 'anon cannot read the contractors table');

select test.check((select count(*) from public.get_change_by_token(:'token1')) = 1, 'token returns its change');
select test.check((select number from public.get_change_by_token(:'token1')) = 1, 'token returns only its own change');
select test.check((select count(*) from public.get_change_by_token('nope')) = 0, 'bad token returns nothing');
select test.check((select count(*) from public.get_change_by_token(null)) = 0, 'null token returns nothing');

select test.expect_error(format($$ select * from public.approve_change(%L, ' ') $$, :'token1'), 'approval needs a name');
select test.expect_error($$ select * from public.approve_change('00000000000000000000000000000000', 'Sarah') $$, 'unknown token cannot be approved');

select test.check((select status from public.approve_change(:'token1', '  Sarah   Lee ')) = 'approved', 'client can approve');
select test.check((select approved_name from public.approve_change(:'token1', 'Someone Else')) = 'Sarah Lee', 'second approval does not overwrite the first');
reset role;

select test.check((select approved_at is not null and approved_at <= now() from public.changes where number = 1), 'approved_at is server time');
select test.check((select approved_user_agent from public.changes where number = 1) = 'Mozilla/5.0 (iPhone) Test', 'user agent is recorded');
select test.check((select count(*) from public.job_events where kind = 'change_approved') = 1, 'approval is logged once');

-- ---------------------------------------------------------------- A after approval
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
select test.check((select approved_name from public.changes where number = 1) = 'Sarah Lee', 'A sees the approval');
select test.expect_error($$ update public.changes set status = 'void' where number = 1 $$, 'approved change cannot be voided');
select test.expect_error($$ update public.changes set price_cents = 1 where number = 1 $$, 'approved change cannot be edited');

update public.changes set status = 'void' where number = 2;
select test.check((select count(*) from public.job_events where kind = 'change_voided') = 1, 'voiding is logged');
select test.expect_error($$ update public.changes set status = 'sent' where number = 2 $$, 'void change cannot be revived');

insert into public.changes (job_id, description, price_cents, status)
  values ('10000000-0000-0000-0000-00000000000a', 'Draft idea', 500, 'draft');
update public.changes set price_cents = 600 where number = 3;
select test.check((select price_cents from public.changes where number = 3) = 600, 'drafts can be edited');
delete from public.changes where number = 3;
select test.check((select count(*) from public.changes where number = 3) = 0, 'drafts can be deleted');
reset role;

set role anon;
select test.check((select status from public.get_change_by_token(:'token2')) = 'void', 'void link reports void');
select test.check((select description is null and price_cents is null from public.get_change_by_token(:'token2')), 'void link hides details');
select test.expect_error(format($$ select * from public.approve_change(%L, 'Sarah Lee') $$, :'token2'), 'void change cannot be approved');
reset role;

-- Even the database owner cannot edit an approved change.
select test.expect_error($$ update public.changes set price_cents = 1 where number = 1 $$, 'approved change is locked for everyone');

\echo 'All security checks passed.'
