-- JobThread v1 schema.
--
-- Money is integer cents, entered before tax. Contractors reach their own rows
-- through RLS. Clients never touch tables: the approval page uses the two
-- security-definer functions at the bottom of this file.
--
-- Immutability rules (enforced in triggers, not just the UI):
--   * once a change is sent, description / price / time added are locked
--   * approved, declined and void changes can never be updated
--   * only approve_change() can mark a change approved, using server time
--   * the job log is append-only; contractors can only add notes to it

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.contractors (
  id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  business_name text not null check (length(trim(business_name)) between 1 and 120),
  phone         text not null check (length(trim(phone)) between 7 and 30),
  created_at    timestamptz not null default now()
);

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null default auth.uid() references public.contractors (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  phone         text not null check (length(trim(phone)) between 7 and 30),
  email         text check (email is null or length(email) <= 200),
  created_at    timestamptz not null default now()
);
create index clients_contractor_id_idx on public.clients (contractor_id);

create table public.jobs (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null default auth.uid() references public.contractors (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete restrict,
  title          text not null check (length(trim(title)) between 1 and 120),
  address        text check (address is null or length(address) <= 300),
  contract_cents integer not null default 0 check (contract_cents >= 0),
  tax_rate       numeric(5, 4) not null default 0.13 check (tax_rate >= 0 and tax_rate < 1),
  start_date     date,
  status         text not null default 'active' check (status in ('active', 'done')),
  created_at     timestamptz not null default now()
);
create index jobs_contractor_id_idx on public.jobs (contractor_id);
create index jobs_client_id_idx on public.jobs (client_id);

create table public.changes (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs (id) on delete cascade,
  number              integer not null,
  description         text not null check (length(trim(description)) between 1 and 1000),
  -- Negative is allowed so a change can be a credit (work removed).
  price_cents         integer not null,
  time_added          text check (time_added is null or length(time_added) <= 80),
  status              text not null default 'draft'
                        check (status in ('draft', 'sent', 'approved', 'declined', 'void')),
  -- gen_random_uuid() is 122 random bits from a CSPRNG; hex without dashes.
  approval_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  sent_at             timestamptz,
  approved_at         timestamptz,
  approved_name       text,
  approved_user_agent text,
  created_at          timestamptz not null default now(),
  unique (job_id, number),
  check (status <> 'approved' or (approved_at is not null and approved_name is not null)),
  check (status = 'draft' or sent_at is not null)
);
create index changes_job_id_idx on public.changes (job_id);

create table public.job_events (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  kind       text not null
               check (kind in ('note', 'change_sent', 'change_approved', 'change_declined', 'change_voided')),
  body       text not null check (length(body) between 1 and 2000),
  change_id  uuid references public.changes (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index job_events_job_id_created_at_idx on public.job_events (job_id, created_at);
create index job_events_change_id_idx on public.job_events (change_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Security definer so RLS policies on changes / job_events can check job
-- ownership without recursing through the jobs policy.
create function private.owns_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.contractor_id = (select auth.uid())
  );
$$;

-- True when the statement comes straight from a browser session (PostgREST
-- runs those as anon / authenticated). Inside approve_change(), which is
-- security definer, current_user is the function owner instead.
create function private.is_api_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

-- ---------------------------------------------------------------------------
-- Change triggers
-- ---------------------------------------------------------------------------

create function private.changes_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_user() then
    if new.status not in ('draft', 'sent') then
      raise exception 'A new change must be a draft or sent.' using errcode = '42501';
    end if;
    new.approved_at := null;
    new.approved_name := null;
    new.approved_user_agent := null;
  end if;

  -- Number changes 1, 2, 3... per job. Lock the job row so two sends at once
  -- can't pick the same number.
  perform 1 from public.jobs where id = new.job_id for update;
  select coalesce(max(c.number), 0) + 1 into new.number
  from public.changes c where c.job_id = new.job_id;

  new.created_at := now();
  if new.status <> 'draft' then
    new.sent_at := now();
  else
    new.sent_at := null;
  end if;
  return new;
end;
$$;

create function private.changes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'declined', 'void') then
    raise exception 'Change #% is % and can no longer be changed.', old.number, old.status
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.job_id is distinct from old.job_id
     or new.number is distinct from old.number
     or new.approval_token is distinct from old.approval_token
     or new.created_at is distinct from old.created_at then
    raise exception 'These fields cannot be changed.' using errcode = '42501';
  end if;

  if old.status <> 'draft' and (
       new.description is distinct from old.description
       or new.price_cents is distinct from old.price_cents
       or new.time_added is distinct from old.time_added) then
    raise exception 'Change #% has been sent and is locked. Void it and make a new change.', old.number
      using errcode = '42501';
  end if;

  if private.is_api_user() then
    -- Contractors may send a draft, or void a draft or a sent change.
    if not (
         new.status = old.status
         or (old.status = 'draft' and new.status in ('sent', 'void'))
         or (old.status = 'sent' and new.status = 'void')) then
      raise exception 'Only the client can approve or decline a change.' using errcode = '42501';
    end if;
    new.approved_at := old.approved_at;
    new.approved_name := old.approved_name;
    new.approved_user_agent := old.approved_user_agent;
  end if;

  if old.status = 'draft' and new.status <> 'draft' then
    new.sent_at := now();
  else
    new.sent_at := old.sent_at;
  end if;
  return new;
end;
$$;

-- Writes the job log entries for change status moves. Security definer
-- because contractors themselves may only insert notes.
create function private.changes_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text := case when tg_op = 'INSERT' then 'draft' else old.status end;
begin
  if new.status = v_old_status then
    return null;
  end if;

  if new.status = 'sent' then
    insert into public.job_events (job_id, kind, body, change_id)
    values (new.job_id, 'change_sent', format('Change #%s sent', new.number), new.id);
  elsif new.status = 'approved' then
    insert into public.job_events (job_id, kind, body, change_id)
    values (new.job_id, 'change_approved',
            format('Change #%s approved by %s', new.number, new.approved_name), new.id);
  elsif new.status = 'declined' then
    insert into public.job_events (job_id, kind, body, change_id)
    values (new.job_id, 'change_declined', format('Change #%s declined', new.number), new.id);
  elsif new.status = 'void' and v_old_status <> 'draft' then
    insert into public.job_events (job_id, kind, body, change_id)
    values (new.job_id, 'change_voided', format('Change #%s voided', new.number), new.id);
  end if;
  return null;
end;
$$;

create trigger changes_before_insert before insert on public.changes
  for each row execute function private.changes_before_insert();
create trigger changes_before_update before update on public.changes
  for each row execute function private.changes_before_update();
create trigger changes_log_event after insert or update of status on public.changes
  for each row execute function private.changes_log_event();

-- Server time for notes too.
create function private.set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger job_events_set_created_at before insert on public.job_events
  for each row execute function private.set_created_at();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.owns_job(uuid) to authenticated;
grant execute on function private.is_api_user() to authenticated;

-- Column-level grants: the browser can only write the columns it should.
grant select on public.contractors to authenticated;
grant insert (id, name, business_name, phone) on public.contractors to authenticated;
grant update (name, business_name, phone) on public.contractors to authenticated;

grant select on public.clients to authenticated;
grant insert (id, contractor_id, name, phone, email) on public.clients to authenticated;
grant update (name, phone, email) on public.clients to authenticated;

grant select on public.jobs to authenticated;
grant insert (id, contractor_id, client_id, title, address, contract_cents, tax_rate, start_date, status)
  on public.jobs to authenticated;
grant update (title, address, contract_cents, tax_rate, start_date, status) on public.jobs to authenticated;

grant select on public.changes to authenticated;
grant insert (job_id, description, price_cents, time_added, status) on public.changes to authenticated;
grant update (description, price_cents, time_added, status) on public.changes to authenticated;
grant delete on public.changes to authenticated;

grant select on public.job_events to authenticated;
grant insert (job_id, kind, body) on public.job_events to authenticated;

alter table public.contractors enable row level security;
alter table public.clients     enable row level security;
alter table public.jobs        enable row level security;
alter table public.changes     enable row level security;
alter table public.job_events  enable row level security;

create policy "own profile: read" on public.contractors
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: create" on public.contractors
  for insert to authenticated with check (id = (select auth.uid()));
create policy "own profile: update" on public.contractors
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own clients: read" on public.clients
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy "own clients: create" on public.clients
  for insert to authenticated with check (contractor_id = (select auth.uid()));
create policy "own clients: update" on public.clients
  for update to authenticated
  using (contractor_id = (select auth.uid())) with check (contractor_id = (select auth.uid()));

create policy "own jobs: read" on public.jobs
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy "own jobs: create" on public.jobs
  for insert to authenticated with check (
    contractor_id = (select auth.uid())
    and exists (select 1 from public.clients c
                where c.id = client_id and c.contractor_id = (select auth.uid()))
  );
create policy "own jobs: update" on public.jobs
  for update to authenticated
  using (contractor_id = (select auth.uid())) with check (contractor_id = (select auth.uid()));

create policy "own changes: read" on public.changes
  for select to authenticated using (private.owns_job(job_id));
create policy "own changes: create" on public.changes
  for insert to authenticated with check (private.owns_job(job_id));
create policy "own changes: update" on public.changes
  for update to authenticated using (private.owns_job(job_id)) with check (private.owns_job(job_id));
create policy "own changes: delete drafts" on public.changes
  for delete to authenticated using (private.owns_job(job_id) and status = 'draft');

create policy "own job log: read" on public.job_events
  for select to authenticated using (private.owns_job(job_id));
create policy "own job log: add notes" on public.job_events
  for insert to authenticated with check (private.owns_job(job_id) and kind = 'note' and change_id is null);

-- ---------------------------------------------------------------------------
-- Public approval functions (the client page calls only these)
-- ---------------------------------------------------------------------------

-- Returns only what the approval page shows. Drafts and unknown tokens return
-- no row. A void change returns its status and nothing else.
create type public.change_for_client as (
  status         text,
  business_name  text,
  contractor_phone text,
  client_name    text,
  job_title      text,
  job_address    text,
  number         integer,
  description    text,
  price_cents    integer,
  tax_rate       numeric,
  time_added     text,
  sent_at        timestamptz,
  approved_at    timestamptz,
  approved_name  text
);

create function public.get_change_by_token(p_token text)
returns setof public.change_for_client
language sql
stable
security definer
set search_path = ''
as $$
  select
    ch.status,
    co.business_name,
    co.phone,
    case when ch.status = 'void' then null else cl.name end,
    case when ch.status = 'void' then null else j.title end,
    case when ch.status = 'void' then null else j.address end,
    case when ch.status = 'void' then null else ch.number end,
    case when ch.status = 'void' then null else ch.description end,
    case when ch.status = 'void' then null else ch.price_cents end,
    case when ch.status = 'void' then null else j.tax_rate end,
    case when ch.status = 'void' then null else ch.time_added end,
    case when ch.status = 'void' then null else ch.sent_at end,
    ch.approved_at,
    ch.approved_name
  from public.changes ch
  join public.jobs j on j.id = ch.job_id
  join public.clients cl on cl.id = j.client_id
  join public.contractors co on co.id = j.contractor_id
  where ch.approval_token = p_token
    and ch.status <> 'draft'
    and length(coalesce(p_token, '')) = 32;
$$;

-- Approves a sent change with server time. Calling it again on an approved
-- change returns the existing record and changes nothing.
create function public.approve_change(p_token text, p_name text)
returns setof public.change_for_client
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_change public.changes%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_user_agent text;
begin
  select * into v_change from public.changes
  where approval_token = p_token and status <> 'draft' and length(coalesce(p_token, '')) = 32
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_change.status = 'void' then
    raise exception 'voided' using errcode = 'P0001';
  end if;
  if v_change.status = 'sent' then
    if length(v_name) < 2 or length(v_name) > 120 then
      raise exception 'name_required' using errcode = '22023';
    end if;

    begin
      v_user_agent := left(current_setting('request.headers', true)::json ->> 'user-agent', 500);
    exception when others then
      v_user_agent := null;
    end;

    update public.changes
    set status = 'approved',
        approved_at = now(),
        approved_name = v_name,
        approved_user_agent = v_user_agent
    where id = v_change.id;
  end if;

  return query select * from public.get_change_by_token(p_token);
end;
$$;

revoke all on function public.get_change_by_token(text) from public;
revoke all on function public.approve_change(text, text) from public;
grant execute on function public.get_change_by_token(text) to anon, authenticated;
grant execute on function public.approve_change(text, text) to anon, authenticated;
