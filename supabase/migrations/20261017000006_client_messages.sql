-- JobThread: texts to the client, logged on the job thread.
--
-- The contractor writes the text in JobThread; it's saved here as a
-- 'message_sent' event, then their phone's Messages app opens with it. Replies
-- aren't captured (that would need a texting service).

alter table public.job_events drop constraint job_events_kind_check;
alter table public.job_events add constraint job_events_kind_check check (kind in (
  'note', 'daily_log', 'message_sent',
  'change_sent', 'change_approved', 'change_declined', 'change_voided',
  'payment_requested', 'payment_received',
  'quote_accepted'
));

drop policy "own job log: add notes and daily logs" on public.job_events;
create policy "own job log: add notes, daily logs and messages" on public.job_events
  for insert to authenticated with check (
    private.owns_job(job_id) and kind in ('note', 'daily_log', 'message_sent')
    and change_id is null and milestone_id is null
  );
