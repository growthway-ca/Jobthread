-- JobThread: planned shutoffs (water, power, gas, heat, internet).
--
-- A shutoff is a schedule item with a utility and an optional time window. It
-- shows on Today, on the client page when it's visible to the client, and on
-- every trade's job sheet for that job, so nobody is surprised mid-shower or
-- mid-cut.

alter table public.job_schedule
  add column utility   text check (utility is null or utility in ('water', 'power', 'gas', 'heat', 'internet')),
  add column from_time time,
  add column to_time   time,
  add constraint job_schedule_times_check check (to_time is null or from_time is null or to_time > from_time);

grant insert (utility, from_time, to_time) on public.job_schedule to authenticated;
grant update (utility, from_time, to_time) on public.job_schedule to authenticated;

-- The client page now carries the utility and time window.
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

-- Job sheets list the job's upcoming shutoffs for the trade.
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
