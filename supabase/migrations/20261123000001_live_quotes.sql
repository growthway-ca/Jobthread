-- JobThread: live quotes.
--
-- The proposal page becomes something the client plays with instead of a PDF:
--   * photos of the space at the top (Outside, Inside, Close up)
--   * pick-one choice groups ("Frame: Aluminium or PVC"), with colour swatches
--   * one big price that moves as they tap
--   * sign with a finger, as well as the typed name
-- and the contractor sees what the client did (opened, picked, signed), with
-- an email when the quote is first opened and when it's signed.

-- ---------------------------------------------------------------------------
-- Choice groups and swatches
-- ---------------------------------------------------------------------------

-- kind 'choice': one of a group the client picks exactly one from. Options in
-- a group share group_name; recommended marks the one picked to start.
alter table public.quote_options drop constraint quote_options_kind_check;
alter table public.quote_options add constraint quote_options_kind_check
  check (kind in ('addon', 'package', 'choice'));
alter table public.quote_options
  add column group_name text check (group_name is null or length(trim(group_name)) between 1 and 60),
  add column swatch     text check (swatch is null or swatch ~ '^#[0-9a-fA-F]{6}$'),
  add constraint quote_options_choice_group_check check ((kind = 'choice') = (group_name is not null));
grant insert (group_name, swatch) on public.quote_options to authenticated;
grant update (group_name, swatch) on public.quote_options to authenticated;

-- ---------------------------------------------------------------------------
-- Photos on a quote
-- ---------------------------------------------------------------------------

create table public.quote_photos (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes (id) on delete cascade,
  -- Object name in the quote-photos bucket: "<quote_id>/<file>".
  storage_path text not null unique check (length(storage_path) <= 300),
  label        text check (label is null or length(trim(label)) between 1 and 40),
  position     integer not null default 0,
  width        integer,
  height       integer,
  created_at   timestamptz not null default now(),
  check (storage_path like quote_id::text || '/%')
);
create index quote_photos_quote_id_idx on public.quote_photos (quote_id, position);

alter table public.quote_photos enable row level security;
revoke all on public.quote_photos from anon, authenticated;
grant select, delete on public.quote_photos to authenticated;
grant insert (id, quote_id, storage_path, label, position, width, height) on public.quote_photos to authenticated;
grant update (label, position) on public.quote_photos to authenticated;

create policy "own quote photos: read" on public.quote_photos
  for select to authenticated using (private.owns_quote(quote_id));
create policy "own quote photos: create" on public.quote_photos
  for insert to authenticated with check (private.owns_quote(quote_id));
create policy "own quote photos: update" on public.quote_photos
  for update to authenticated using (private.owns_quote(quote_id)) with check (private.owns_quote(quote_id));
create policy "own quote photos: delete" on public.quote_photos
  for delete to authenticated using (private.owns_quote(quote_id));

create function private.owns_quote_photo_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.owns_quote(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;
revoke all on function private.owns_quote_photo_path(text) from public, anon;
grant execute on function private.owns_quote_photo_path(text) to authenticated;

-- Public under unguessable names, like change photos, so the proposal page
-- can show them without signing in. Uploads only into your own quotes' folders.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-photos', 'quote-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "quote photos: upload to own quotes" on storage.objects
  for insert to authenticated with check (bucket_id = 'quote-photos' and private.owns_quote_photo_path(name));
-- Read access through the API too, so a revision can copy the photos across.
create policy "quote photos: read own quotes" on storage.objects
  for select to authenticated using (bucket_id = 'quote-photos' and private.owns_quote_photo_path(name));
create policy "quote photos: delete from own quotes" on storage.objects
  for delete to authenticated using (bucket_id = 'quote-photos' and private.owns_quote_photo_path(name));

-- ---------------------------------------------------------------------------
-- Signature, and what the client did
-- ---------------------------------------------------------------------------

-- The finger signature, as SVG path data in a 300 x 100 box. Set only by
-- accept_quote(); not granted to the API roles.
alter table public.quotes add column accepted_signature text
  check (accepted_signature is null or length(accepted_signature) <= 20000);

-- Email me when a quote is opened or signed. On by default.
alter table public.contractors add column quote_alerts boolean not null default true;
grant insert (quote_alerts) on public.contractors to authenticated;
grant update (quote_alerts) on public.contractors to authenticated;

-- The client's taps on the proposal before signing: "Picked PVC frame, price
-- now $1,350". total_cents is what the page showed after the tap.
create table public.quote_events (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  kind        text not null check (kind in ('picked', 'removed')),
  option_id   uuid references public.quote_options (id) on delete set null,
  title       text not null check (length(title) between 1 and 120),
  total_cents integer check (total_cents is null or total_cents between 0 and 1000000000),
  created_at  timestamptz not null default now()
);
create index quote_events_quote_id_idx on public.quote_events (quote_id, created_at);

alter table public.quote_events enable row level security;
revoke all on public.quote_events from anon, authenticated;
grant select on public.quote_events to authenticated;
create policy "own quote events: read" on public.quote_events
  for select to authenticated using (private.owns_quote(quote_id));

-- Called by the proposal page when the client taps an option. Only while the
-- quote is open, and at most 300 taps per quote so a stuck page can't flood it.
create function public.record_quote_pick(p_token text, p_option_id uuid, p_on boolean, p_total_cents integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_title text;
begin
  select * into v_quote from public.quotes
  where approval_token = p_token and status = 'sent' and length(coalesce(p_token, '')) = 32;
  if not found then
    return;
  end if;
  if v_quote.valid_until is not null and v_quote.valid_until < (now() at time zone 'America/Toronto')::date then
    return;
  end if;
  select coalesce(group_name || ': ', '') || title into v_title
  from public.quote_options where id = p_option_id and quote_id = v_quote.id;
  if v_title is null then
    return;
  end if;
  if (select count(*) from public.quote_events where quote_id = v_quote.id) >= 300 then
    return;
  end if;
  insert into public.quote_events (quote_id, kind, option_id, title, total_cents)
  values (v_quote.id, case when p_on then 'picked' else 'removed' end, p_option_id, left(v_title, 120),
          case when p_total_cents between 0 and 1000000000 then p_total_cents end);
end;
$$;
revoke all on function public.record_quote_pick(text, uuid, boolean, integer) from public;
grant execute on function public.record_quote_pick(text, uuid, boolean, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email alerts to the contractor
-- ---------------------------------------------------------------------------

-- Sends through Resend with pg_net, using the resend_api_key Vault secret from
-- the sign-up alert. Never raises: without the key, or if sending fails, the
-- client's page carries on and no email goes out.
create function private.quote_alert(p_quote_id uuid, p_subject text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  api_key text;
  v_to    text;
begin
  begin
    select u.email into v_to
    from public.quotes q
    join public.contractors co on co.id = q.contractor_id
    join auth.users u on u.id = co.id
    where q.id = p_quote_id and co.quote_alerts;
    if v_to is null or to_regclass('vault.decrypted_secrets') is null then
      return;
    end if;
    select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
    if api_key is null then
      return;
    end if;
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'JobThread <alerts@jobthread.ca>',
        'to', jsonb_build_array(v_to),
        'subject', p_subject,
        'text', p_body || E'\n\nOpen the quote: https://app.jobthread.ca/quotes/' || p_quote_id
                       || E'\n\nTurn these emails off in JobThread under Settings.'
      )
    );
  exception when others then
    raise warning 'quote alert not sent: %', sqlerrm;
  end;
end;
$$;
revoke all on function private.quote_alert(uuid, text, text) from public, anon, authenticated;

-- First time the client opens the quote.
create function private.quote_first_view_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text;
  v_number integer;
begin
  if exists (select 1 from public.quote_views where quote_id = new.quote_id and id <> new.id) then
    return new;
  end if;
  select cl.name, q.number into v_client, v_number
  from public.quotes q join public.clients cl on cl.id = q.client_id where q.id = new.quote_id;
  perform private.quote_alert(new.quote_id,
    format('%s opened quote #%s', v_client, v_number),
    format('%s just opened quote #%s for the first time.', v_client, v_number));
  return new;
end;
$$;
revoke all on function private.quote_first_view_alert() from public, anon, authenticated;

create trigger quote_views_first_alert after insert on public.quote_views
  for each row execute function private.quote_first_view_alert();

-- When the client signs.
create function private.quote_signed_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text;
  v_phone  text;
  v_total  integer;
begin
  if not (old.status = 'sent' and new.status = 'accepted') then
    return new;
  end if;
  select cl.name, cl.phone into v_client, v_phone from public.clients cl where cl.id = new.client_id;
  select new.base_cents + coalesce(sum(price_cents), 0) into v_total
  from public.quote_options where quote_id = new.id and selected;
  perform private.quote_alert(new.id,
    format('%s signed quote #%s', v_client, new.number),
    format(E'%s signed quote #%s (%s) for $%s + HST.\n\nCall them now: %s',
           new.accepted_name, new.number, new.title, to_char(v_total / 100.0, 'FM999,999,990.00'), v_phone));
  return new;
end;
$$;
revoke all on function private.quote_signed_alert() from public, anon, authenticated;

create trigger quotes_signed_alert after update on public.quotes
  for each row execute function private.quote_signed_alert();

-- ---------------------------------------------------------------------------
-- What the proposal page gets, and accepting with a signature
-- ---------------------------------------------------------------------------

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
      'contractor_name', co.name,
      'contractor_phone', co.phone,
      'etransfer_email', co.etransfer_email,
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
      'accepted_signature', q.accepted_signature,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'kind', o.kind, 'group_name', o.group_name, 'swatch', o.swatch,
                 'title', o.title, 'detail', o.detail, 'price_cents', o.price_cents,
                 'recommended', o.recommended, 'selected', o.selected)
               order by o.kind desc, o.position, o.created_at)
        from public.quote_options o where o.quote_id = q.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object('path', p.storage_path, 'label', p.label, 'width', p.width, 'height', p.height)
               order by p.position, p.created_at)
        from public.quote_photos p where p.quote_id = q.id), '[]'::jsonb)
    )
  end
  from public.quotes q
  join public.clients cl on cl.id = q.client_id
  join public.contractors co on co.id = q.contractor_id
  where q.approval_token = p_token
    and q.status <> 'draft'
    and length(coalesce(p_token, '')) = 32;
$$;

-- Same as before, plus: one pick from every choice group, and the finger
-- signature saved with the typed name. No defaults, so the API can tell this
-- apart from the three-argument version older pages still call.
create function public.accept_quote(p_token text, p_name text, p_option_ids uuid[], p_signature text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_signature text := nullif(trim(coalesce(p_signature, '')), '');
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
  -- SVG path commands and numbers only.
  if v_signature is not null and (length(v_signature) > 20000 or v_signature !~ '^[MLQCZmlqcz0-9 .,-]+$') then
    raise exception 'bad_signature' using errcode = '22023';
  end if;
  if exists (select 1 from public.quote_options where quote_id = v_quote.id and kind = 'package')
     and (select count(*) from public.quote_options
          where quote_id = v_quote.id and kind = 'package' and id = any(coalesce(p_option_ids, '{}'))) <> 1 then
    raise exception 'pick_package' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.quote_options o
    where o.quote_id = v_quote.id and o.kind = 'choice'
    group by o.group_name
    having count(*) filter (where o.id = any(coalesce(p_option_ids, '{}'))) <> 1
  ) then
    raise exception 'pick_choice' using errcode = '22023';
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
  values (v_job, 'quote_accepted', format('Quote #%s %s by %s, $%s + HST', v_quote.number,
          case when v_signature is null then 'accepted' else 'signed' end, v_name,
          to_char(greatest(v_contract, 0) / 100.0, 'FM999,999,990.00')));

  if v_quote.deposit_rate > 0 and v_contract > 0 then
    insert into public.payment_milestones (job_id, title, amount_cents, due_note)
    values (v_job, 'Booking deposit', greatest(round(v_contract * v_quote.deposit_rate)::integer, 1),
            'Due to book the job');
  end if;

  update public.quotes
  set status = 'accepted', accepted_at = now(), accepted_name = v_name,
      accepted_user_agent = v_user_agent, accepted_signature = v_signature, job_id = v_job
  where id = v_quote.id;

  return public.get_quote_by_token(p_token);
end;
$$;
revoke all on function public.accept_quote(text, text, uuid[], text) from public;
grant execute on function public.accept_quote(text, text, uuid[], text) to anon, authenticated;

-- The three-argument version, kept for pages loaded before this update.
create or replace function public.accept_quote(p_token text, p_name text, p_option_ids uuid[])
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.accept_quote(p_token, p_name, p_option_ids, null::text);
$$;
