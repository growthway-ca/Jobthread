import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { formatMoney, jobTotals } from '../lib/money';
import { ErrorNote, Header, Loading } from '../components/Layout';
import type { Job } from '../lib/types';

type JobRow = Job & {
  clients: { name: string } | null;
  changes: { status: string; price_cents: number }[];
};

export function Jobs() {
  const { contractor, signOut } = useAuth();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('jobs')
      .select('*, clients(name), changes(status, price_cents)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        else setJobs((data as JobRow[]) ?? []);
      });
  }, []);

  const sorted = jobs && [...jobs].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1));

  return (
    <>
      <Header
        right={
          <button className="header-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        }
      />
      <main className="page">
        <div className="title-row">
          <h1>Jobs</h1>
          {contractor && <span className="muted">{contractor.business_name}</span>}
        </div>
        <Link to="/jobs/new" className="btn primary">
          New job
        </Link>
        <ErrorNote message={error} />
        {!sorted && !error && <Loading />}
        {sorted && sorted.length === 0 && (
          <p className="muted center pad">No jobs yet. Add the job you’re on now.</p>
        )}
        <ul className="list">
          {sorted?.map((job) => {
            const totals = jobTotals(job.contract_cents, job.tax_rate, job.changes);
            const waiting = job.changes.filter((c) => c.status === 'sent').length;
            return (
              <li key={job.id}>
                <Link to={`/jobs/${job.id}`} className={`card job-card ${job.status === 'done' ? 'done' : ''}`}>
                  <div className="job-card-main">
                    <strong className="job-title">{job.title}</strong>
                    <span className="muted">{job.clients?.name}</span>
                    {waiting > 0 && (
                      <span className="pill waiting">
                        {waiting} waiting on approval
                      </span>
                    )}
                    {job.status === 'done' && <span className="pill">Done</span>}
                  </div>
                  <div className="job-card-total">
                    <span className="money">{formatMoney(totals.totalCents)}</span>
                    <span className="muted small">incl. HST</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
