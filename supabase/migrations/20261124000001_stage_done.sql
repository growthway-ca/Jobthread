-- JobThread: stages the contractor marks done.
--
-- Each schedule item that isn't a shutoff is a stage of the work. The
-- contractor marks a stage done, with the date it was finished; the client
-- page shows the stages as a dated ledger, and the job thread logs it.

alter table public.job_schedule add column done_on date;
grant insert (done_on) on public.job_schedule to authenticated;
grant update (done_on) on public.job_schedule to authenticated;

alter table public.job_events drop constraint job_events_kind_check;
alter table public.job_events add constraint job_events_kind_check check (kind in (
  'note', 'daily_log', 'message_sent',
  'change_sent', 'change_approved', 'change_declined', 'change_voided',
  'payment_requested', 'payment_received',
  'quote_accepted', 'selections_confirmed', 'stage_done'
));

-- "Done: Framing (Nov 12)" on the thread when a stage is first marked done.
create function private.stage_done_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.done_on is not null and old.done_on is null and new.utility is null then
    insert into public.job_events (job_id, kind, body)
    values (new.job_id, 'stage_done',
            left('Done: ' || new.title || ' (' || to_char(new.done_on, 'Mon FMDD') || ')', 2000));
  end if;
  return new;
end;
$$;
revoke all on function private.stage_done_event() from public, anon, authenticated;

create trigger job_schedule_stage_done after update on public.job_schedule
  for each row execute function private.stage_done_event();

-- The client page carries when each stage was done.
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
               'utility', s.utility, 'from_time', s.from_time, 'to_time', s.to_time,
               'done_on', s.done_on)
             order by s.starts_on, s.created_at)
      from public.job_schedule s where s.job_id = j.id and s.visible_to_client), '[]'::jsonb),
    'selections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'category', x.category, 'brand', x.brand, 'name', x.name, 'code', x.code,
               'color', x.color, 'finish', x.finish, 'size', x.size, 'grout', x.grout, 'pattern', x.pattern,
               'location', x.location, 'note', x.note,
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
