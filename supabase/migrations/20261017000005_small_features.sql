-- JobThread: smaller features from the design canvas.
--
--   * changes: why (client asked / found on site / inspector), who does it,
--     and a photo of the spot (locked once sent, like the rest of the change)
--   * subcontractors with WSIB clearance and insurance expiry dates
--   * Good / Better / Best packages on quotes (client picks exactly one)
--   * Google rating and credentials on proposals
--   * client consent for before-and-after photo posts
--
-- Additive; the live app keeps working.

-- ---------------------------------------------------------------------------
-- Changes: why, who, photo
-- ---------------------------------------------------------------------------

alter table public.changes
  add column reason     text check (reason is null or reason in ('client_asked', 'found_on_site', 'inspector')),
  add column trade      text check (trade is null or length(trade) <= 80),
  add column photo_path text check (photo_path is null or length(photo_path) <= 300);

grant insert (reason, trade, photo_path) on public.changes to authenticated;
grant update (reason, trade, photo_path) on public.changes to authenticated;

-- Extend the "sent changes are locked" rule to the new fields.
create or replace function private.changes_before_update()
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
       or new.time_added is distinct from old.time_added
       or new.reason is distinct from old.reason
       or new.trade is distinct from old.trade
       or new.photo_path is distinct from old.photo_path) then
    raise exception 'Change #% has been sent and is locked. Void it and make a new change.', old.number
      using errcode = '42501';
  end if;

  if private.is_api_user() then
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

-- The approval page shows the new fields too.
alter type public.change_for_client
  add attribute reason text,
  add attribute trade text,
  add attribute photo_path text;

create or replace function public.get_change_by_token(p_token text)
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
    ch.approved_name,
    case when ch.status = 'void' then null else ch.reason end,
    case when ch.status = 'void' then null else ch.trade end,
    case when ch.status = 'void' then null else ch.photo_path end
  from public.changes ch
  join public.jobs j on j.id = ch.job_id
  join public.clients cl on cl.id = j.client_id
  join public.contractors co on co.id = j.contractor_id
  where ch.approval_token = p_token
    and ch.status <> 'draft'
    and length(coalesce(p_token, '')) = 32;
$$;

-- Change photos live in a public bucket under unguessable names, so the
-- client's approval page can show them without signing in. Uploads are
-- limited to the contractor's own job folders.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('change-photos', 'change-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "change photos: upload to own jobs" on storage.objects
  for insert to authenticated with check (bucket_id = 'change-photos' and private.owns_photo_path(name));

-- ---------------------------------------------------------------------------
-- Subcontractor paperwork
-- ---------------------------------------------------------------------------

create table public.subcontractors (
  id                   uuid primary key default gen_random_uuid(),
  contractor_id        uuid not null default auth.uid() references public.contractors (id) on delete cascade,
  name                 text not null check (length(trim(name)) between 1 and 120),
  trade                text check (trade is null or length(trade) <= 80),
  phone                text check (phone is null or length(phone) <= 30),
  email                text check (email is null or length(email) <= 200),
  wsib_expires_on      date,
  insurance_expires_on date,
  notes                text check (notes is null or length(notes) <= 500),
  created_at           timestamptz not null default now()
);
create index subcontractors_contractor_idx on public.subcontractors (contractor_id);

revoke all on public.subcontractors from anon, authenticated;
grant select, delete on public.subcontractors to authenticated;
grant insert (id, contractor_id, name, trade, phone, email, wsib_expires_on, insurance_expires_on, notes)
  on public.subcontractors to authenticated;
grant update (name, trade, phone, email, wsib_expires_on, insurance_expires_on, notes)
  on public.subcontractors to authenticated;

alter table public.subcontractors enable row level security;
create policy "own subs: read" on public.subcontractors
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy "own subs: create" on public.subcontractors
  for insert to authenticated with check (contractor_id = (select auth.uid()));
create policy "own subs: update" on public.subcontractors
  for update to authenticated
  using (contractor_id = (select auth.uid())) with check (contractor_id = (select auth.uid()));
create policy "own subs: delete" on public.subcontractors
  for delete to authenticated using (contractor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Quote packages, rating and credentials
-- ---------------------------------------------------------------------------

alter table public.quote_options
  add column kind text not null default 'addon' check (kind in ('addon', 'package'));
grant insert (kind) on public.quote_options to authenticated;
grant update (kind) on public.quote_options to authenticated;

alter table public.contractors
  add column google_rating       numeric(2, 1) check (google_rating is null or (google_rating >= 1 and google_rating <= 5)),
  add column google_review_count integer check (google_review_count is null or google_review_count >= 0),
  add column credentials         text check (credentials is null or length(credentials) <= 120);
grant insert (google_rating, google_review_count, credentials) on public.contractors to authenticated;
grant update (google_rating, google_review_count, credentials) on public.contractors to authenticated;

create or replace function public.get_quote_by_token(p_token text)
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
      'google_rating', co.google_rating,
      'google_review_count', co.google_review_count,
      'credentials', co.credentials,
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
                 'id', o.id, 'kind', o.kind, 'title', o.title, 'detail', o.detail, 'price_cents', o.price_cents,
                 'recommended', o.recommended, 'selected', o.selected)
               order by o.kind desc, o.position, o.created_at)
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

-- Same as before, plus: when a quote has packages, the client must pick
-- exactly one of them.
create or replace function public.accept_quote(p_token text, p_name text, p_option_ids uuid[])
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
  if exists (select 1 from public.quote_options where quote_id = v_quote.id and kind = 'package')
     and (select count(*) from public.quote_options
          where quote_id = v_quote.id and kind = 'package' and id = any(coalesce(p_option_ids, '{}'))) <> 1 then
    raise exception 'pick_package' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- Before-and-after posts: the client's OK to share photos
-- ---------------------------------------------------------------------------

alter table public.jobs add column photo_consent_at timestamptz;
grant update (photo_consent_at) on public.jobs to authenticated;
