import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { formatMoney, jobTotals } from '../lib/money';
import { firstName } from '../lib/sms';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { paymentProgress, type PaymentProgress } from '../lib/progress';
import { stageProgress, workAheadOfMoney, type StageProgress } from '../lib/stages';
import type { Job } from '../lib/types';

type JobRow = Job & {
  clients: { name: string } | null;
  changes: { status: string; price_cents: number }[];
  payment_milestones: { status: string; amount_cents: number; position: number }[];
  job_schedule?: { title: string; starts_on: string; utility: string | null; done_on?: string | null }[];
};

type Filter = 'active' | 'close' | 'done';

export function Jobs() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');

  useEffect(() => {
    const base = '*, clients(name), changes(status, price_cents), payment_milestones(status, amount_cents, position)';
    const load = (columns: string) => supabase.from('jobs').select(columns).order('created_at', { ascending: false });
    void (async () => {
      let res = await load(`${base}, job_schedule(title, starts_on, utility, done_on)`);
      // Before update 11 there's no done_on: show the list without stages rather than nothing.
      if (res.error) res = await load(base);
      if (res.error) setError(errorMessage(res.error));
      else setJobs((res.data ?? []) as unknown as JobRow[]);
    })();
  }, []);

  const rows = (jobs ?? []).map((job) => {
    const totals = jobTotals(job.contract_cents, job.tax_rate, job.changes);
    const progress = paymentProgress({
      subtotalCents: totals.subtotalCents,
      holdbackRate: Number(job.holdback_rate ?? 0),
      holdbackReleased: Boolean(job.holdback_released_at),
      milestones: job.payment_milestones,
    });
    const stages = stageProgress(job.job_schedule ?? []);
    return { job, subtotal: totals.subtotalCents, progress, stages };
  });
  const active = rows.filter((r) => r.job.status === 'active');
  const close = active.filter((r) => r.progress.fullyPaid);
  const done = rows.filter((r) => r.job.status === 'done');
  const shown = filter === 'active' ? active : filter === 'close' ? close : done;
  const activeTotal = active.reduce((t, r) => t + r.subtotal, 0);
  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'active', label: 'In progress', count: active.length },
    { id: 'close', label: 'Ready to close', count: close.length },
    { id: 'done', label: 'Finished', count: done.length },
  ];

  return (
    <Page>
      <div className="page-title">
        <h1>Jobs</h1>
        <Link to="/jobs/new" className="btn small title-action">
          + New job
        </Link>
      </div>
      {jobs && jobs.length > 0 && (
        <p className="muted page-summary">
          {active.length === 1 ? '1 active job' : `${active.length} active jobs`} · {formatMoney(activeTotal)} before HST
        </p>
      )}
      <ErrorNote message={error} />
      {!jobs && !error && <Loading />}
      {jobs && jobs.length === 0 && (
        <p className="muted center pad">No jobs yet. Add the job you’re on now, or win one from a quote.</p>
      )}
      {jobs && jobs.length > 0 && (
        <>
          <div className="filter-chips" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`filter-chip ${filter === f.id ? 'on' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          {filter === 'close' && shown.length > 0 && (
            <p className="muted small">Paid in full and not marked done yet. Mark them done to ask for a review.</p>
          )}
          {shown.length === 0 ? (
            <p className="muted center pad">
              {filter === 'active'
                ? 'No jobs in progress.'
                : filter === 'close'
                  ? 'No jobs are paid in full and still open.'
                  : 'No finished jobs yet.'}
            </p>
          ) : (
            <ul className="list">
              {shown.map((r) => (
                <li key={r.job.id}>
                  <JobCard job={r.job} subtotal={r.subtotal} progress={r.progress} stages={r.stages} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}

function JobCard({
  job,
  subtotal,
  progress,
  stages,
}: {
  job: JobRow;
  subtotal: number;
  progress: PaymentProgress;
  stages: StageProgress<NonNullable<JobRow['job_schedule']>[number]>;
}) {
  const waiting = job.changes.filter((c) => c.status === 'sent').length;
  const requested = job.payment_milestones.some((m) => m.status === 'requested');
  const client = job.clients?.name ?? '';
  const hasStages = stages.stages.length > 0;
  const behind = !progress.fullyPaid && workAheadOfMoney(stages.fraction, progress.fraction, hasStages);

  return (
    <Link to={`/jobs/${job.id}`} className={`card job-card ${job.status === 'done' ? 'done' : ''}`}>
      <div className="job-card-top">
        <strong className="job-title">{job.title}</strong>
        <span className="money">{formatMoney(subtotal)}</span>
        <span className="row-chevron" aria-hidden="true" />
      </div>
      <span className="muted">{client}</span>
      {hasStages && (
        <>
          <div className="stage-segs" aria-hidden="true">
            {stages.stages.map((s, i) => (
              <span key={i} className={s.done_on ? 'done' : s === stages.current ? 'now' : ''} />
            ))}
          </div>
          <span className="stage-label">{stages.label}</span>
        </>
      )}
      <div className="job-card-pills">
        {!hasStages && <span className="pill">No stages</span>}
        <span className={`pill ${progress.fullyPaid ? 'approved-pill' : behind ? 'waiting' : ''}`}>
          {progress.label}
          {behind ? ' · ask for the next draw' : ''}
        </span>
        {requested && <span className="pill waiting">Payment requested</span>}
        {waiting > 0 && (
          <span className="pill waiting">
            {waiting === 1 ? '1 change' : `${waiting} changes`} waiting on {firstName(client)}
          </span>
        )}
      </div>
    </Link>
  );
}
