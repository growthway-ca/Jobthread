-- JobThread: selections (paint colours, flooring and other picks).
--
-- What the client picked, written down once: brand, name, code and where it
-- goes. The client sees them on their page and confirms with their typed name,
-- and trades see them on their job sheets. Changing what a pick says clears its
-- confirmation, so a confirmation always matches what's on the page.

create table public.job_selections (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs (id) on delete cascade,
  category       text not null check (category in ('paint', 'flooring', 'other')),
  brand          text check (brand is null or length(brand) <= 80),
  name           text not null check (length(trim(name)) between 1 and 120),
  code           text check (code is null or length(code) <= 60),
  color          text check (color is null or length(color) <= 80),
  finish         text check (finish is null or length(finish) <= 60),
  location       text check (location is null or length(location) <= 200),
  note           text check (note is null or length(note) <= 500),
  confirmed_name text,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index job_selections_job_id_idx on public.job_selections (job_id, category, created_at);

create function private.job_selections_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.category, new.brand, new.name, new.code, new.color, new.finish, new.location, new.note)
     is distinct from (old.category, old.brand, old.name, old.code, old.color, old.finish, old.location, old.note) then
    new.confirmed_name := null;
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;

create trigger job_selections_touch before update on public.job_selections
  for each row execute function private.job_selections_touch();

alter table public.job_selections enable row level security;
revoke all on public.job_selections from anon, authenticated;
grant select, delete on public.job_selections to authenticated;
grant insert (id, job_id, category, brand, name, code, color, finish, location, note) on public.job_selections to authenticated;
grant update (category, brand, name, code, color, finish, location, note) on public.job_selections to authenticated;

create policy "own selections: read" on public.job_selections
  for select to authenticated using (private.owns_job(job_id));
create policy "own selections: create" on public.job_selections
  for insert to authenticated with check (private.owns_job(job_id));
create policy "own selections: update" on public.job_selections
  for update to authenticated using (private.owns_job(job_id)) with check (private.owns_job(job_id));
create policy "own selections: delete" on public.job_selections
  for delete to authenticated using (private.owns_job(job_id));

-- The confirmation shows on the job thread.
alter table public.job_events drop constraint job_events_kind_check;
alter table public.job_events add constraint job_events_kind_check check (kind in (
  'note', 'daily_log', 'message_sent',
  'change_sent', 'change_approved', 'change_declined', 'change_voided',
  'payment_requested', 'payment_received',
  'quote_accepted', 'selections_confirmed'
));

-- The client confirms the picks they were shown (by id), with their typed
-- name. Picks already confirmed, or changed since, are left alone. Returns how
-- many were confirmed.
create function public.confirm_selections(p_token text, p_name text, p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_names text;
  v_count integer;
begin
  select id into v_job_id from public.jobs where share_token = p_token and length(coalesce(p_token, '')) = 32;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name_required' using errcode = '22023';
  end if;

  with done as (
    update public.job_selections
    set confirmed_name = v_name, confirmed_at = now()
    where job_id = v_job_id and id = any(coalesce(p_ids, '{}')) and confirmed_at is null
    returning name, category
  )
  select count(*), string_agg(name, ', ' order by category, name) into v_count, v_names from done;

  if v_count > 0 then
    insert into public.job_events (job_id, kind, body)
    values (v_job_id, 'selections_confirmed',
            left(v_name || ' confirmed ' || case when v_count = 1 then 'a selection' else v_count || ' selections' end
                 || ': ' || v_names, 2000));
  end if;
  return v_count;
end;
$$;

revoke all on function public.confirm_selections(text, text, uuid[]) from public;
grant execute on function public.confirm_selections(text, text, uuid[]) to anon, authenticated;

-- The client page carries the selections.
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
               'title', s.title, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'trade', s.trade, 'note', s.note,
               'utility', s.utility, 'from_time', s.from_time, 'to_time', s.to_time)
             order by s.starts_on, s.created_at)
      from public.job_schedule s where s.job_id = j.id and s.visible_to_client), '[]'::jsonb),
    'selections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'category', x.category, 'brand', x.brand, 'name', x.name, 'code', x.code,
               'color', x.color, 'finish', x.finish, 'location', x.location, 'note', x.note,
               'confirmed_name', x.confirmed_name, 'confirmed_at', x.confirmed_at)
             order by x.category, x.created_at)
      from public.job_selections x where x.job_id = j.id), '[]'::jsonb),
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

-- Job sheets carry them too, so the painter has the codes.
create or replace function public.get_job_sheet(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sheet public.job_sheets%rowtype;
  v_any public.job_sheets%rowtype;
  v_business text;
  v_result jsonb;
begin
  select * into v_any from public.job_sheets where token = p_token and length(coalesce(p_token, '')) = 32;
  if not found then
    return null;
  end if;
  select co.business_name into v_business
  from public.jobs j join public.contractors co on co.id = j.contractor_id where j.id = v_any.job_id;

  v_sheet := private.open_sheet(p_token);
  if v_sheet.id is null then
    return jsonb_build_object('closed', true, 'business_name', v_business);
  end if;

  -- Log the open; reloads within ten minutes count once, and the contractor
  -- previewing their own sheet doesn't count.
  if not private.owns_job(v_sheet.job_id) and not exists (select 1 from public.job_sheet_views
                 where sheet_id = v_sheet.id and kind = 'opened' and viewed_at > now() - interval '10 minutes') then
    insert into public.job_sheet_views (sheet_id, kind) values (v_sheet.id, 'opened');
  end if;

  select jsonb_build_object(
    'closed', false,
    'business_name', co.business_name,
    'contractor_name', co.name,
    'contractor_phone', co.phone,
    'trade_name', v_sheet.trade_name,
    'title', coalesce(v_sheet.title, sch.title),
    'starts_on', sch.starts_on,
    'ends_on', sch.ends_on,
    'address', j.address,
    'job_title', j.title,
    'parking', si.parking,
    'access', si.access,
    'has_code', coalesce(length(si.access_code), 0) > 0,
    'heads_up', si.heads_up,
    'washroom', si.washroom,
    'water', si.water,
    'power', si.power,
    'notes', si.notes,
    'selections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'category', x.category, 'brand', x.brand, 'name', x.name, 'code', x.code,
               'color', x.color, 'finish', x.finish, 'location', x.location, 'note', x.note,
               'confirmed_name', x.confirmed_name, 'confirmed_at', x.confirmed_at)
             order by x.category, x.created_at)
      from public.job_selections x where x.job_id = j.id), '[]'::jsonb),
    'shutoffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'utility', so.utility, 'title', so.title, 'starts_on', so.starts_on, 'ends_on', so.ends_on,
               'from_time', so.from_time, 'to_time', so.to_time, 'note', so.note)
             order by so.starts_on, so.from_time nulls first)
      from public.job_schedule so
      where so.job_id = j.id and so.utility is not null
        and coalesce(so.ends_on, so.starts_on) >= (now() at time zone 'America/Toronto')::date), '[]'::jsonb)
  ) into v_result
  from public.jobs j
  join public.contractors co on co.id = j.contractor_id
  left join public.job_site si on si.job_id = j.id
  left join public.job_schedule sch on sch.id = v_sheet.schedule_item_id
  where j.id = v_sheet.job_id;
  return v_result;
end;
$$;
