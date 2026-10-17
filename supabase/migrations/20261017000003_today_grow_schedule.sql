-- JobThread: job schedule, quote views, leads and referrals, reviews and
-- check-ins (the Today and Grow tabs).
--
-- Additive. Same rules as before: RLS on every table, column grants, and
-- public pages only go through security-definer functions.

-- ---------------------------------------------------------------------------
-- Schedule: what's happening on which dates
-- ---------------------------------------------------------------------------

create table public.job_schedule (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.jobs (id) on delete cascade,
  title             text not null check (length(trim(title)) between 1 and 120),
  starts_on         date not null,
  ends_on           date,
  trade             text check (trade is null or length(trade) <= 80),
  note              text check (note is null or length(note) <= 500),
  visible_to_client boolean not null default true,
  created_at        timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index job_schedule_job_id_idx on public.job_schedule (job_id, starts_on);

-- ---------------------------------------------------------------------------
-- Quote views ("opened 3 times last night")
-- ---------------------------------------------------------------------------

create table public.quote_views (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references public.quotes (id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index quote_views_quote_id_idx on public.quote_views (quote_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- Leads: added by hand or from a client's referral link
-- ---------------------------------------------------------------------------

alter table public.clients
  add column referral_token text not null unique default replace(gen_random_uuid()::text, '-', '');

create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  contractor_id         uuid not null default auth.uid() references public.contractors (id) on delete cascade,
  name                  text not null check (length(trim(name)) between 1 and 120),
  phone                 text check (phone is null or length(phone) <= 30),
  email                 text check (email is null or length(email) <= 200),
  project               text check (project is null or length(project) <= 1000),
  source                text not null default 'manual' check (source in ('manual', 'referral')),
  referred_by_client_id uuid references public.clients (id) on delete set null,
  status                text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'closed')),
  created_at            timestamptz not null default now()
);
create index leads_contractor_id_idx on public.leads (contractor_id, created_at desc);
create index leads_referred_by_idx on public.leads (referred_by_client_id);

-- ---------------------------------------------------------------------------
-- Reviews and check-ins
-- ---------------------------------------------------------------------------

alter table public.contractors
  add column google_review_url text check (google_review_url is null or length(google_review_url) <= 500);

alter table public.jobs
  add column done_at            timestamptz,
  add column review_asked_at    timestamptz,
  add column review_reminded_at timestamptz,
  add column review_received_at timestamptz,
  add column checkin_6m_at      timestamptz,
  add column checkin_12m_at     timestamptz;

-- Jobs already marked done count from now.
update public.jobs set done_at = now() where status = 'done' and done_at is null;

create function private.jobs_track_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.done_at := now();
  elsif new.status <> 'done' then
    new.done_at := null;
  else
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

create trigger jobs_track_done before update on public.jobs
  for each row execute function private.jobs_track_done();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.job_schedule, public.quote_views, public.leads from anon, authenticated;

grant select, delete on public.job_schedule to authenticated;
grant insert (id, job_id, title, starts_on, ends_on, trade, note, visible_to_client) on public.job_schedule to authenticated;
grant update (title, starts_on, ends_on, trade, note, visible_to_client) on public.job_schedule to authenticated;

grant select on public.quote_views to authenticated;

grant select, delete on public.leads to authenticated;
grant insert (id, contractor_id, name, phone, email, project) on public.leads to authenticated;
grant update (name, phone, email, project, status) on public.leads to authenticated;

grant insert (google_review_url) on public.contractors to authenticated;
grant update (google_review_url) on public.contractors to authenticated;
grant update (review_asked_at, review_reminded_at, review_received_at, checkin_6m_at, checkin_12m_at)
  on public.jobs to authenticated;

alter table public.job_schedule enable row level security;
alter table public.quote_views  enable row level security;
alter table public.leads        enable row level security;

create policy "own schedule: read" on public.job_schedule
  for select to authenticated using (private.owns_job(job_id));
create policy "own schedule: create" on public.job_schedule
  for insert to authenticated with check (private.owns_job(job_id));
create policy "own schedule: update" on public.job_schedule
  for update to authenticated using (private.owns_job(job_id)) with check (private.owns_job(job_id));
create policy "own schedule: delete" on public.job_schedule
  for delete to authenticated using (private.owns_job(job_id));

create policy "own quote views: read" on public.quote_views
  for select to authenticated using (private.owns_quote(quote_id));

create policy "own leads: read" on public.leads
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy "own leads: create" on public.leads
  for insert to authenticated with check (contractor_id = (select auth.uid()));
create policy "own leads: update" on public.leads
  for update to authenticated
  using (contractor_id = (select auth.uid())) with check (contractor_id = (select auth.uid()));
create policy "own leads: delete" on public.leads
  for delete to authenticated using (contractor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Public functions
-- ---------------------------------------------------------------------------

-- Called by the proposal page. Reloads within two minutes count once.
create function public.record_quote_view(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quote uuid;
begin
  select id into v_quote from public.quotes
  where approval_token = p_token and status = 'sent' and length(coalesce(p_token, '')) = 32;
  if v_quote is null then
    return;
  end if;
  if exists (select 1 from public.quote_views
             where quote_id = v_quote and viewed_at > now() - interval '2 minutes') then
    return;
  end if;
  insert into public.quote_views (quote_id) values (v_quote);
end;
$$;

-- What the referral page shows: whose business, and who sent the friend.
create function public.get_referral_page(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business_name', co.business_name,
    'referrer_first_name', split_part(trim(cl.name), ' ', 1)
  )
  from public.clients cl
  join public.contractors co on co.id = cl.contractor_id
  where cl.referral_token = p_token and length(coalesce(p_token, '')) = 32;
$$;

-- A friend of a client asks for a quote. At most 10 a day per referral link.
create function public.submit_referral(p_token text, p_name text, p_phone text, p_project text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
begin
  select * into v_client from public.clients
  where referral_token = p_token and length(coalesce(p_token, '')) = 32;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 or length(v_phone) < 7 or length(v_phone) > 30
     or length(coalesce(p_project, '')) > 1000 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if (select count(*) from public.leads
      where referred_by_client_id = v_client.id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.leads (contractor_id, name, phone, project, source, referred_by_client_id)
  values (v_client.contractor_id, v_name, v_phone, nullif(trim(coalesce(p_project, '')), ''), 'referral', v_client.id);
  return true;
end;
$$;

-- The client page now shows the schedule too (items marked visible).
create or replace function public.get_job_by_share_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business_name', co.business_name,
    'contractor_phone', co.phone,
    'etransfer_email', co.etransfer_email,
    'client_name', cl.name,
    'title', j.title,
    'address', j.address,
    'status', j.status,
    'contract_cents', j.contract_cents,
    'tax_rate', j.tax_rate,
    'holdback_rate', j.holdback_rate,
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'number', ch.number,
               'description', ch.description,
               'price_cents', ch.price_cents,
               'time_added', ch.time_added,
               'status', ch.status,
               'sent_at', ch.sent_at,
               'approved_at', ch.approved_at,
               'approved_name', ch.approved_name,
               'approval_token', case when ch.status = 'sent' then ch.approval_token end)
             order by ch.number)
      from public.changes ch
      where ch.job_id = j.id and ch.status in ('sent', 'approved')), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', m.title,
               'amount_cents', m.amount_cents,
               'due_note', m.due_note,
               'status', m.status,
               'requested_at', m.requested_at,
               'paid_at', m.paid_at)
             order by m.position)
      from public.payment_milestones m where m.job_id = j.id), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', s.title, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'trade', s.trade, 'note', s.note)
             order by s.starts_on, s.created_at)
      from public.job_schedule s where s.job_id = j.id and s.visible_to_client), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('body', e.body, 'created_at', e.created_at) order by e.created_at desc)
      from (select body, created_at from public.job_events
            where job_id = j.id and kind = 'daily_log'
            order by created_at desc limit 20) e), '[]'::jsonb)
  )
  from public.jobs j
  join public.clients cl on cl.id = j.client_id
  join public.contractors co on co.id = j.contractor_id
  where j.share_token = p_token
    and length(coalesce(p_token, '')) = 32;
$$;

revoke all on function public.record_quote_view(text) from public;
revoke all on function public.get_referral_page(text) from public;
revoke all on function public.submit_referral(text, text, text, text) from public;
grant execute on function public.record_quote_view(text) to anon, authenticated;
grant execute on function public.get_referral_page(text) to anon, authenticated;
grant execute on function public.submit_referral(text, text, text, text) to anon, authenticated;
