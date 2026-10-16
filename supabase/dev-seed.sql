-- DEV ONLY. Adds one sample job to an existing contractor so there is
-- something to click through. Never run this against production.
--
-- It is deliberately not named seed.sql, so the Supabase CLI never applies it
-- on its own. Sign in to the app once (local or dev project) and finish the
-- profile step, then run:
--
--   psql "$DEV_DATABASE_URL" -v email=you@example.com -f supabase/dev-seed.sql

\set ON_ERROR_STOP on

-- psql variables aren't visible inside a DO block, so pass the email through
-- a session setting.
select set_config('seed.email', :'email', false);

do $$
declare
  v_contractor uuid;
  v_client uuid;
  v_job uuid;
begin
  select c.id into v_contractor
  from public.contractors c join auth.users u on u.id = c.id
  where lower(u.email) = lower(current_setting('seed.email'));

  if v_contractor is null then
    raise exception 'No contractor profile for %. Sign in and finish the profile step first.',
      current_setting('seed.email');
  end if;

  insert into public.clients (contractor_id, name, phone)
  values (v_contractor, 'Sarah Lee', '705-555-0199')
  returning id into v_client;

  insert into public.jobs (contractor_id, client_id, title, address, contract_cents, start_date)
  values (v_contractor, v_client, 'Kitchen renovation', '12 Elm Street', 2500000, current_date)
  returning id into v_job;

  insert into public.job_events (job_id, kind, body)
  values (v_job, 'note', 'Sample job from the dev seed. Demo starts Monday.');

  insert into public.changes (job_id, description, price_cents, time_added, status)
  values (v_job, 'Add four pot lights over the island', 85000, 'Half a day', 'sent');

  raise notice 'Added a sample job for %.', current_setting('seed.email');
end;
$$;
