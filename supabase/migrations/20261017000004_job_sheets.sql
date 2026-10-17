-- JobThread: job sheets for subs and trades (/s/<token>).
--
-- Each job has site info (parking, how to get in, heads up, washroom, water,
-- power). The contractor sends a trade their own sheet link. The page never
-- touches tables: it calls security-definer functions. The lockbox code is
-- only handed out by reveal_access_code(), which logs the name and time.
-- A sheet stops working when it's closed or the job is marked done.

create table public.job_site (
  job_id      uuid primary key references public.jobs (id) on delete cascade,
  parking     text check (parking is null or length(parking) <= 300),
  access      text check (access is null or length(access) <= 500),
  access_code text check (access_code is null or length(access_code) <= 60),
  heads_up    text check (heads_up is null or length(heads_up) <= 1500),
  washroom    text check (washroom is null or length(washroom) <= 200),
  water       text check (water is null or length(water) <= 200),
  power       text check (power is null or length(power) <= 200),
  notes       text check (notes is null or length(notes) <= 1500),
  updated_at  timestamptz not null default now()
);

create table public.job_sheets (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.jobs (id) on delete cascade,
  token            text not null unique default replace(gen_random_uuid()::text, '-', ''),
  trade_name       text not null check (length(trim(trade_name)) between 1 and 120),
  trade_phone      text check (trade_phone is null or length(trade_phone) <= 30),
  schedule_item_id uuid references public.job_schedule (id) on delete set null,
  title            text check (title is null or length(title) <= 120),
  closed_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index job_sheets_job_id_idx on public.job_sheets (job_id);

create table public.job_sheet_views (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references public.job_sheets (id) on delete cascade,
  kind        text not null check (kind in ('opened', 'code')),
  viewer_name text check (viewer_name is null or length(viewer_name) <= 120),
  viewed_at   timestamptz not null default now()
);
create index job_sheet_views_sheet_idx on public.job_sheet_views (sheet_id, viewed_at desc);

create function private.job_site_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger job_site_touch before insert or update on public.job_site
  for each row execute function private.job_site_touch();

-- A sheet can only point at a schedule item on its own job, and its link and
-- job never change.
create function private.job_sheets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.job_id is distinct from old.job_id or new.token is distinct from old.token
                            or new.created_at is distinct from old.created_at) then
    raise exception 'These fields cannot be changed.' using errcode = '42501';
  end if;
  if new.schedule_item_id is not null and not exists (
       select 1 from public.job_schedule s where s.id = new.schedule_item_id and s.job_id = new.job_id) then
    raise exception 'That schedule item is on another job.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger job_sheets_guard before insert or update on public.job_sheets
  for each row execute function private.job_sheets_guard();

revoke all on public.job_site, public.job_sheets, public.job_sheet_views from anon, authenticated;

grant select on public.job_site to authenticated;
grant insert (job_id, parking, access, access_code, heads_up, washroom, water, power, notes) on public.job_site to authenticated;
grant update (parking, access, access_code, heads_up, washroom, water, power, notes) on public.job_site to authenticated;

grant select on public.job_sheets to authenticated;
grant insert (id, job_id, trade_name, trade_phone, schedule_item_id, title) on public.job_sheets to authenticated;
grant update (trade_name, trade_phone, schedule_item_id, title, closed_at) on public.job_sheets to authenticated;

grant select on public.job_sheet_views to authenticated;

alter table public.job_site        enable row level security;
alter table public.job_sheets      enable row level security;
alter table public.job_sheet_views enable row level security;

create policy "own site info: read" on public.job_site
  for select to authenticated using (private.owns_job(job_id));
create policy "own site info: create" on public.job_site
  for insert to authenticated with check (private.owns_job(job_id));
create policy "own site info: update" on public.job_site
  for update to authenticated using (private.owns_job(job_id)) with check (private.owns_job(job_id));

create policy "own sheets: read" on public.job_sheets
  for select to authenticated using (private.owns_job(job_id));
create policy "own sheets: create" on public.job_sheets
  for insert to authenticated with check (private.owns_job(job_id));
create policy "own sheets: update" on public.job_sheets
  for update to authenticated using (private.owns_job(job_id)) with check (private.owns_job(job_id));

create policy "own sheet views: read" on public.job_sheet_views
  for select to authenticated using (
    exists (select 1 from public.job_sheets s where s.id = sheet_id and private.owns_job(s.job_id))
  );

-- Finds an open sheet by token. Closed sheets and finished jobs don't count.
create function private.open_sheet(p_token text)
returns public.job_sheets
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.job_sheets s
  join public.jobs j on j.id = s.job_id
  where s.token = p_token and length(coalesce(p_token, '')) = 32
    and s.closed_at is null and j.status = 'active';
$$;
revoke all on function private.open_sheet(text) from public, anon, authenticated;

-- What the sheet page shows, without the lockbox code. A closed sheet returns
-- only {closed, business_name}; an unknown token returns null.
create function public.get_job_sheet(p_token text)
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
    'notes', si.notes
  ) into v_result
  from public.jobs j
  join public.contractors co on co.id = j.contractor_id
  left join public.job_site si on si.job_id = j.id
  left join public.job_schedule sch on sch.id = v_sheet.schedule_item_id
  where j.id = v_sheet.job_id;
  return v_result;
end;
$$;

-- Hands out the lockbox code and logs who asked. At most 20 a day per sheet.
create function public.reveal_access_code(p_token text, p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sheet public.job_sheets%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code text;
begin
  v_sheet := private.open_sheet(p_token);
  if v_sheet.id is null then
    raise exception 'closed' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if (select count(*) from public.job_sheet_views
      where sheet_id = v_sheet.id and kind = 'code' and viewed_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  select access_code into v_code from public.job_site where job_id = v_sheet.job_id;
  if coalesce(v_code, '') = '' then
    raise exception 'no_code' using errcode = 'P0002';
  end if;
  insert into public.job_sheet_views (sheet_id, kind, viewer_name) values (v_sheet.id, 'code', v_name);
  return v_code;
end;
$$;

revoke all on function public.get_job_sheet(text) from public;
revoke all on function public.reveal_access_code(text, text) from public;
grant execute on function public.get_job_sheet(text) to anon, authenticated;
grant execute on function public.reveal_access_code(text, text) to anon, authenticated;
