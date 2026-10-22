-- Checks that the new-sign-up alert can never block signing up.
-- Runs after client_messages_test.sql. The test database has no Vault or
-- pg_net, which is the same as the secrets not being set.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'new@example.com');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003"}', false);
set client_min_messages = error;  -- the expected "alert not sent" warning
insert into public.contractors (name, business_name, phone) values ('Dana', 'Dana Builds', '705-555-0300');
reset client_min_messages;
select test.check((select count(*) from public.contractors where id = 'cccccccc-0000-0000-0000-000000000003') = 1,
  'sign-up works when the alert cannot be sent');
reset role;

select test.check(
  (select count(*) from pg_trigger where tgname = 'contractors_signup_alert' and not tgisinternal) = 1,
  'the sign-up alert trigger is in place');
select test.expect_error($$ set role authenticated; select private.signup_alert() $$, 'users cannot call the alert function directly');
reset role;

\o
\echo 'All sign-up alert checks passed.'
