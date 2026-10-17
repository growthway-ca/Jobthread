-- JobThread: the client's project page (/j/<token>).
--
-- One private link per job that the homeowner keeps: what's left to pay, the
-- payment schedule, changes, and the contractor's daily updates. Read-only.
-- Like the approval page, it never touches tables: it calls a single
-- security-definer function that returns only what the page shows.

alter table public.jobs
  add column share_token text not null unique default replace(gen_random_uuid()::text, '-', '');

-- Everything the page shows, as JSON. Unknown tokens return null.
create function public.get_job_by_share_token(p_token text)
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
               -- Only waiting changes need a link; the client can approve
               -- them from here.
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

-- Issues a new link for a job, so an old one stops working.
create function public.reset_job_share_token(p_job_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if not private.owns_job(p_job_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.jobs set share_token = v_token where id = p_job_id;
  return v_token;
end;
$$;

revoke all on function public.get_job_by_share_token(text) from public;
revoke all on function public.reset_job_share_token(uuid) from public;
grant execute on function public.get_job_by_share_token(text) to anon, authenticated;
grant execute on function public.reset_job_share_token(uuid) to authenticated;
