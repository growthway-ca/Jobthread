import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { formatMoney, jobTotals } from '../lib/money';
import { firstName } from '../lib/sms';
import { ErrorNote, Loading, Page } from '../components/Layout';
import type { Job } from '../lib/types';

type JobRow = Job & {
  clients: { name: string } | null;
  changes: { status: string; price_cents: number }[];
  payment_milestones: { status: string; amount_cents: number; position: number }[];
};

export function Jobs() {
  const { contractor } = useAuth();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('jobs')
      .select('*, clients(name), changes(status, price_cents), payment_milestones(status, amount_cents, position)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        else setJobs((data as JobRow[]) ?? []);
      });
  }, []);

  const active = jobs?.filter((j) => j.status === 'active') ?? [];
  const done = jobs?.filter((j) => j.status === 'done') ?? [];

  return (
    <Page>
      <div className="title-row">
        <h1>Jobs</h1>
        {contractor && <span className="muted">{contractor.business_name}</span>}
      </div>
      <Link to="/jobs/new" className="btn primary">
        New job
      </Link>
      <ErrorNote message={error} />
      {!jobs && !error && <Loading />}
      {jobs && jobs.length === 0 && (
        <p className="muted center pad">No jobs yet. Add the job you’re on now, or win one from a quote.</p>
      )}
      {active.length > 0 && <JobSection title="In progress" jobs={active} />}
      {done.length > 0 && <JobSection title="Finished" jobs={done} />}
    </Page>
  );
}

function JobSection({ title, jobs }: { title: string; jobs: JobRow[] }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      <ul className="list">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const totals = jobTotals(job.contract_cents, job.tax_rate, job.changes);
  const waiting = job.changes.filter((c) => c.status === 'sent').length;
  const milestones = [...job.payment_milestones].sort((a, b) => a.position - b.position);
  const paid = milestones.filter((m) => m.status === 'paid').length;
  const requested = milestones.some((m) => m.status === 'requested');
  const client = job.clients?.name ?? '';

  return (
    <Link to={`/jobs/${job.id}`} className={`card job-card ${job.status === 'done' ? 'done' : ''}`}>
      <div className="job-card-main">
        <strong className="job-title">{job.title}</strong>
        <span className="muted">{client}</span>
        {waiting > 0 && (
          <span className="pill waiting">
            {waiting === 1 ? '1 change' : `${waiting} changes`} waiting on {firstName(client)}
          </span>
        )}
        {requested && <span className="pill waiting">Payment requested</span>}
        {milestones.length > 0 && (
          <div className="progress-wrap">
            <div className="progress" aria-hidden="true">
              {milestones.map((m, i) => (
                <span key={i} className={`seg ${m.status}`} />
              ))}
            </div>
            <span className="muted small">
              {paid} of {milestones.length} payments in
            </span>
          </div>
        )}
      </div>
      <div className="job-card-total">
        <span className="money">{formatMoney(totals.subtotalCents)}</span>
        <span className="muted small">before HST</span>
      </div>
    </Link>
  );
}
