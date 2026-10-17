-- JobThread: daily logs with photos, payment schedules, holdbacks, quotes.
--
-- Additive to the v1 schema; the v1 app keeps working unchanged.
-- Same rules as v1: RLS plus column grants, server timestamps, and records
-- that lock once they've gone to the client:
--   * daily logs and photos are append-only, like notes
--   * a payment request locks its title and amount; a paid milestone is final
--   * a sent quote is locked; only accept_quote() can accept it, and doing so
--     creates the job (and a booking deposit, if the quote asks for one)

-- ---------------------------------------------------------------------------
-- Contractor payment details
-- ---------------------------------------------------------------------------

alter table public.contractors
  add column etransfer_email text check (etransfer_email is null or length(etransfer_email) <= 200);

grant insert (etransfer_email) on public.contractors to authenticated;
grant update (etransfer_email) on public.contractors to authenticated;

-- ---------------------------------------------------------------------------
-- Holdbacks (Ontario Construction Act: owners keep back 10% until the
-- lien period passes). Tracked per job; amounts are computed in the app.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column holdback_rate numeric(4, 3) not null default 0 check (holdback_rate >= 0 and holdback_rate <= 0.2),
  add column holdback_release_date date,
  add column holdback_released_at timestamptz;

grant insert (holdback_rate, holdback_release_date) on public.jobs to authenticated;
grant update (holdback_rate, holdback_release_date, holdback_released_at) on public.jobs to authenticated;

-- ---------------------------------------------------------------------------
-- Payment schedule
-- ---------------------------------------------------------------------------

create table public.payment_milestones (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  position     integer not null,
  title        text not null check (length(trim(title)) between 1 and 120),
  -- Before tax, like every other amount in JobThread.
  amount_cents integer not null check (amount_cents > 0),
  due_note     text check (due_note is null or length(due_note) <= 200),
  status       text not null default 'upcoming' check (status in ('upcoming', 'requested', 'paid')),
  requested_at timestamptz,
  paid_at      timestamptz,
  paid_method  text check (paid_method is null or paid_method in ('etransfer', 'cheque', 'cash', 'card', 'other')),
  created_at   timestamptz not null default now(),
  check (status <> 'paid' or (paid_at is not null and paid_method is not null)),
  check (status <> 'requested' or requested_at is not null)
);
create index payment_milestones_job_id_idx on public.payment_milestones (job_id, position);

-- ---------------------------------------------------------------------------
-- Job log: new kinds, links to milestones, photos
-- ---------------------------------------------------------------------------

alter table public.job_events drop constraint job_events_kind_check;
alter table public.job_events add constraint job_events_kind_check check (kind in (
  'note', 'daily_log',
  'change_sent', 'change_approved', 'change_declined', 'change_voided',
  'payment_requested', 'payment_received',
  'quote_accepted'
));
alter table public.job_events
  add column milestone_id uuid references public.payment_milestones (id) on delete set null;
create index job_events_milestone_id_idx on public.job_events (milestone_id);

drop policy "own job log: add notes" on public.job_events;
create policy "own job log: add notes and daily logs" on public.job_events
  for insert to authenticated with check (
    private.owns_job(job_id) and kind in ('note', 'daily_log') and change_id is null and milestone_id is null
  );

create table public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  event_id     uuid not null references public.job_events (id) on delete cascade,
  -- Object name in the job-photos bucket: "<job_id>/<file>".
  storage_path text not null unique check (length(storage_path) <= 300),
  width        integer check (width is null or width between 1 and 10000),
  height       integer check (height is null or height between 1 and 10000),
  created_at   timestamptz not null default now()
);
create index job_photos_job_id_idx on public.job_photos (job_id);
create index job_photos_event_id_idx on public.job_photos (event_id);

create trigger job_photos_set_created_at before insert on public.job_photos
  for each row execute function private.set_created_at();

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------

create table public.quotes (
  id                  uuid primary key default gen_random_uuid(),
  contractor_id       uuid not null default auth.uid() references public.contractors (id) on delete cascade,
  client_id           uuid not null references public.clients (id) on delete restrict,
  number              integer not null,
  title               text not null check (length(trim(title)) between 1 and 120),
  address             text check (address is null or length(address) <= 300),
  -- What's included, one item per line.
  scope               text check (scope is null or length(scope) <= 4000),
  base_cents          integer not null default 0 check (base_cents >= 0),
  tax_rate            numeric(5, 4) not null default 0.13 check (tax_rate >= 0 and tax_rate < 1),
  deposit_rate        numeric(4, 3) not null default 0 check (deposit_rate >= 0 and deposit_rate <= 0.5),
  valid_until         date,
  status              text not null default 'draft'
                        check (status in ('draft', 'sent', 'accepted', 'withdrawn', 'lost')),
  approval_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  sent_at             timestamptz,
  accepted_at         timestamptz,
  accepted_name       text,
  accepted_user_agent text,
  job_id              uuid references public.jobs (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (contractor_id, number),
  check (status <> 'accepted' or (accepted_at is not null and accepted_name is not null)),
  check (status in ('draft', 'withdrawn') or sent_at is not null)
);
create index quotes_contractor_id_idx on public.quotes (contractor_id);
create index quotes_client_id_idx on public.quotes (client_id);
create index quotes_job_id_idx on public.quotes (job_id);

create table public.quote_options (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  position    integer not null default 0,
  title       text not null check (length(trim(title)) between 1 and 120),
  detail      text check (detail is null or length(detail) <= 300),
  price_cents integer not null,
  -- Ticked when the client first opens the proposal.
  recommended boolean not null default false,
  -- Set by accept_quote(): what the client actually picked.
  selected    boolean,
  created_at  timestamptz not null default now()
);
create index quote_options_quote_id_idx on public.quote_options (quote_id, position);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.owns_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quotes q
    where q.id = p_quote_id and q.contractor_id = (select auth.uid())
  );
$$;

-- Photo objects live at "<job_id>/<file>"; the folder decides who owns them.
create function private.owns_photo_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.owns_job(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Milestone triggers
-- ---------------------------------------------------------------------------

create function private.milestones_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_user() and new.status <> 'upcoming' then
    raise exception 'A new payment must start as upcoming.' using errcode = '42501';
  end if;
  perform 1 from public.jobs where id = new.job_id for update;
  select coalesce(max(m.position), 0) + 1 into new.position
  from public.payment_milestones m where m.job_id = new.job_id;
  new.created_at := now();
  new.requested_at := null;
  new.paid_at := null;
  new.paid_method := null;
  return new;
end;
$$;

create function private.milestones_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    raise exception 'That payment is marked paid and can no longer be changed.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.job_id is distinct from old.job_id
     or new.position is distinct from old.position or new.created_at is distinct from old.created_at then
    raise exception 'These fields cannot be changed.' using errcode = '42501';
  end if;
  if old.status = 'requested' and (
       new.title is distinct from old.title or new.amount_cents is distinct from old.amount_cents) then
    raise exception 'That payment has been requested. Cancel the request before changing it.' using errcode = '42501';
  end if;

  if new.status = 'requested' and old.status <> 'requested' then
    new.requested_at := now();
  elsif new.status = 'upcoming' then
    new.requested_at := null;
  else
    new.requested_at := old.requested_at;
  end if;

  if new.status = 'paid' then
    if new.paid_method is null then
      raise exception 'Say how it was paid.' using errcode = '23514';
    end if;
    new.paid_at := now();
  else
    new.paid_at := null;
    new.paid_method := null;
  end if;
  return new;
end;
$$;

create function private.milestones_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'upcoming' then
    raise exception 'Only payments that haven''t been requested can be removed.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create function private.milestones_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount text := '$' || to_char(new.amount_cents / 100.0, 'FM999,999,990.00');
begin
  if new.status = old.status then
    return null;
  end if;
  if new.status = 'requested' then
    insert into public.job_events (job_id, kind, body, milestone_id)
    values (new.job_id, 'payment_requested', format('Payment requested: %s, %s + HST', new.title, v_amount), new.id);
  elsif new.status = 'paid' then
    insert into public.job_events (job_id, kind, body, milestone_id)
    values (new.job_id, 'payment_received', format('Payment received: %s, %s + HST', new.title, v_amount), new.id);
  end if;
  return null;
end;
$$;

create trigger milestones_before_insert before insert on public.payment_milestones
  for each row execute function private.milestones_before_insert();
create trigger milestones_before_update before update on public.payment_milestones
  for each row execute function private.milestones_before_update();
create trigger milestones_before_delete before delete on public.payment_milestones
  for each row execute function private.milestones_before_delete();
create trigger milestones_log_event after update of status on public.payment_milestones
  for each row execute function private.milestones_log_event();

-- ---------------------------------------------------------------------------
-- Quote triggers
-- ---------------------------------------------------------------------------

create function private.quotes_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_user() and new.status not in ('draft', 'sent') then
    raise exception 'A new quote must be a draft or sent.' using errcode = '42501';
  end if;
  perform 1 from public.contractors where id = new.contractor_id for update;
  select coalesce(max(q.number), 1000) + 1 into new.number
  from public.quotes q where q.contractor_id = new.contractor_id;
  new.created_at := now();
  new.sent_at := case when new.status = 'sent' then now() else null end;
  new.accepted_at := null;
  new.accepted_name := null;
  new.accepted_user_agent := null;
  new.job_id := null;
  return new;
end;
$$;

create function private.quotes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('accepted', 'withdrawn', 'lost') then
    raise exception 'Quote #% is % and can no longer be changed.', old.number, old.status
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.contractor_id is distinct from old.contractor_id
     or new.number is distinct from old.number or new.approval_token is distinct from old.approval_token
     or new.created_at is distinct from old.created_at then
    raise exception 'These fields cannot be changed.' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (
       new.client_id is distinct from old.client_id or new.title is distinct from old.title
       or new.address is distinct from old.address or new.scope is distinct from old.scope
       or new.base_cents is distinct from old.base_cents or new.tax_rate is distinct from old.tax_rate
       or new.deposit_rate is distinct from old.deposit_rate or new.valid_until is distinct from old.valid_until) then
    raise exception 'Quote #% has been sent and is locked. Make a revision instead.', old.number
      using errcode = '42501';
  end if;

  if private.is_api_user() then
    if not (
         new.status = old.status
         or (old.status = 'draft' and new.status in ('sent', 'withdrawn'))
         or (old.status = 'sent' and new.status in ('withdrawn', 'lost'))) then
      raise exception 'Only the client can accept a quote.' using errcode = '42501';
    end if;
    new.accepted_at := old.accepted_at;
    new.accepted_name := old.accepted_name;
    new.accepted_user_agent := old.accepted_user_agent;
    new.job_id := old.job_id;
  end if;

  if old.status = 'draft' and new.status = 'sent' then
    new.sent_at := now();
  else
    new.sent_at := old.sent_at;
  end if;
  return new;
end;
$$;

-- Options can only change while their quote is a draft (selection is set by
-- accept_quote(), which runs as the owner and skips this check).
create function private.quote_options_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_api_user() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from public.quotes
  where id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  -- A deleted draft takes its options with it; the quote row is already gone.
  if v_status is null and tg_op = 'DELETE' then
    return old;
  end if;
  if v_status is distinct from 'draft' then
    raise exception 'This quote has been sent and its options are locked.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
    raise exception 'An option cannot move to another quote.' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    new.selected := null;
    return new;
  end if;
  return old;
end;
$$;

create trigger quotes_before_insert before insert on public.quotes
  for each row execute function private.quotes_before_insert();
create trigger quotes_before_update before update on public.quotes
  for each row execute function private.quotes_before_update();
create trigger quote_options_guard before insert or update or delete on public.quote_options
  for each row execute function private.quote_options_guard();

-- Drafts can be deleted; anything that reached the client stays on record.
create function private.quotes_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_user() and old.status <> 'draft' then
    raise exception 'Only draft quotes can be deleted.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger quotes_before_delete before delete on public.quotes
  for each row execute function private.quotes_before_delete();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.payment_milestones, public.job_photos, public.quotes, public.quote_options
  from anon, authenticated;
revoke all on function private.owns_quote(uuid), private.owns_photo_path(text) from public, anon;
grant execute on function private.owns_quote(uuid) to authenticated;
grant execute on function private.owns_photo_path(text) to authenticated;

grant select, delete on public.payment_milestones to authenticated;
grant insert (id, job_id, title, amount_cents, due_note, status) on public.payment_milestones to authenticated;
grant update (title, amount_cents, due_note, status, paid_method) on public.payment_milestones to authenticated;

grant select on public.job_photos to authenticated;
grant insert (job_id, event_id, storage_path, width, height) on public.job_photos to authenticated;

grant select, delete on public.quotes to authenticated;
grant insert (id, contractor_id, client_id, title, address, scope, base_cents, tax_rate, deposit_rate, valid_until, status)
  on public.quotes to authenticated;
grant update (client_id, title, address, scope, base_cents, tax_rate, deposit_rate, valid_until, status)
  on public.quotes to authenticated;

grant select, delete on public.quote_options to authenticated;
grant insert (id, quote_id, position, title, detail, price_cents, recommended) on public.quote_options to authenticated;
grant update (position, title, detail, price_cents, recommended) on public.quote_options to authenticated;

alter table public.payment_milestones enable row level security;
alter table public.job_photos         enable row level security;
alter table public.quotes             enable row level security;
alter table public.quote_options      enable row level security;

create policy "own payments: read" on public.payment_milestones
  for select to authenticated using (private.owns_job(job_id));
create policy "own payments: create" on public.payment_milestones
  for insert to authenticated with check (private.owns_job(job_id));
create policy "own payments: update" on public.payment_milestones
  for update to authenticated using (private.owns_job(job_id)) with check (private.owns_job(job_id));
create policy "own payments: delete" on public.payment_milestones
  for delete to authenticated using (private.owns_job(job_id));

create policy "own photos: read" on public.job_photos
  for select to authenticated using (private.owns_job(job_id));
create policy "own photos: add to own daily logs" on public.job_photos
  for insert to authenticated with check (
    private.owns_job(job_id)
    and storage_path like job_id::text || '/%'
    and exists (select 1 from public.job_events e
                where e.id = event_id and e.job_id = job_photos.job_id and e.kind = 'daily_log')
  );

create policy "own quotes: read" on public.quotes
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy "own quotes: create" on public.quotes
  for insert to authenticated with check (
    contractor_id = (select auth.uid())
    and exists (select 1 from public.clients c
                where c.id = client_id and c.contractor_id = (select auth.uid()))
  );
create policy "own quotes: update" on public.quotes
  for update to authenticated
  using (contractor_id = (select auth.uid()))
  with check (
    contractor_id = (select auth.uid())
    and exists (select 1 from public.clients c
                where c.id = client_id and c.contractor_id = (select auth.uid()))
  );
create policy "own quotes: delete" on public.quotes
  for delete to authenticated using (contractor_id = (select auth.uid()));

create policy "own quote options: read" on public.quote_options
  for select to authenticated using (private.owns_quote(quote_id));
create policy "own quote options: create" on public.quote_options
  for insert to authenticated with check (private.owns_quote(quote_id));
create policy "own quote options: update" on public.quote_options
  for update to authenticated using (private.owns_quote(quote_id)) with check (private.owns_quote(quote_id));
create policy "own quote options: delete" on public.quote_options
  for delete to authenticated using (private.owns_quote(quote_id));

-- ---------------------------------------------------------------------------
-- Photo storage: private bucket, one folder per job
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "job photos: read own jobs" on storage.objects
  for select to authenticated using (bucket_id = 'job-photos' and private.owns_photo_path(name));
create policy "job photos: upload to own jobs" on storage.objects
  for insert to authenticated with check (bucket_id = 'job-photos' and private.owns_photo_path(name));

-- ---------------------------------------------------------------------------
-- Public proposal functions (the proposal page calls only these)
-- ---------------------------------------------------------------------------

-- What the proposal page shows, as JSON. Drafts and unknown tokens return
-- null; a withdrawn quote returns its status and business name only.
create function public.get_quote_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when q.status = 'withdrawn' then
      jsonb_build_object('status', q.status, 'business_name', co.business_name, 'contractor_phone', co.phone)
    else jsonb_build_object(
      'status', q.status,
      'business_name', co.business_name,
      'contractor_phone', co.phone,
      'client_name', cl.name,
      'number', q.number,
      'title', q.title,
      'address', q.address,
      'scope', q.scope,
      'base_cents', q.base_cents,
      'tax_rate', q.tax_rate,
      'deposit_rate', q.deposit_rate,
      'valid_until', q.valid_until,
      'expired', q.status = 'sent' and q.valid_until is not null and q.valid_until < (now() at time zone 'America/Toronto')::date,
      'sent_at', q.sent_at,
      'accepted_at', q.accepted_at,
      'accepted_name', q.accepted_name,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'title', o.title, 'detail', o.detail, 'price_cents', o.price_cents,
                 'recommended', o.recommended, 'selected', o.selected)
               order by o.position, o.created_at)
        from public.quote_options o where o.quote_id = q.id), '[]'::jsonb)
    )
  end
  from public.quotes q
  join public.clients cl on cl.id = q.client_id
  join public.contractors co on co.id = q.contractor_id
  where q.approval_token = p_token
    and q.status <> 'draft'
    and length(coalesce(p_token, '')) = 32;
$$;

-- Accepts a sent quote with the options the client picked, using server
-- time. Creates the job (contract = base + picked options) and, if the quote
-- asks for one, a booking deposit. Calling it again returns the existing
-- record and changes nothing.
create function public.accept_quote(p_token text, p_name text, p_option_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_user_agent text;
  v_contract integer;
  v_job uuid;
begin
  select * into v_quote from public.quotes
  where approval_token = p_token and status <> 'draft' and length(coalesce(p_token, '')) = 32
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_quote.status = 'accepted' then
    return public.get_quote_by_token(p_token);
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if v_quote.valid_until is not null and v_quote.valid_until < (now() at time zone 'America/Toronto')::date then
    raise exception 'expired' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name_required' using errcode = '22023';
  end if;

  begin
    v_user_agent := left(current_setting('request.headers', true)::json ->> 'user-agent', 500);
  exception when others then
    v_user_agent := null;
  end;

  update public.quote_options
  set selected = (id = any(coalesce(p_option_ids, '{}')))
  where quote_id = v_quote.id;

  select v_quote.base_cents + coalesce(sum(price_cents), 0) into v_contract
  from public.quote_options where quote_id = v_quote.id and selected;

  insert into public.jobs (contractor_id, client_id, title, address, contract_cents, tax_rate, start_date)
  values (v_quote.contractor_id, v_quote.client_id, v_quote.title, v_quote.address,
          greatest(v_contract, 0), v_quote.tax_rate, null)
  returning id into v_job;

  insert into public.job_events (job_id, kind, body)
  values (v_job, 'quote_accepted', format('Quote #%s accepted by %s, $%s + HST', v_quote.number, v_name,
          to_char(greatest(v_contract, 0) / 100.0, 'FM999,999,990.00')));

  if v_quote.deposit_rate > 0 and v_contract > 0 then
    insert into public.payment_milestones (job_id, title, amount_cents, due_note)
    values (v_job, 'Booking deposit', greatest(round(v_contract * v_quote.deposit_rate)::integer, 1),
            'Due to book the job');
  end if;

  update public.quotes
  set status = 'accepted', accepted_at = now(), accepted_name = v_name,
      accepted_user_agent = v_user_agent, job_id = v_job
  where id = v_quote.id;

  return public.get_quote_by_token(p_token);
end;
$$;

revoke all on function public.get_quote_by_token(text) from public;
revoke all on function public.accept_quote(text, text, uuid[]) from public;
grant execute on function public.get_quote_by_token(text) to anon, authenticated;
grant execute on function public.accept_quote(text, text, uuid[]) to anon, authenticated;
