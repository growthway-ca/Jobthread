import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage, formatWhen } from '../lib/format';
import { formatMoney, holdbackCents, jobTotals } from '../lib/money';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { PAID_METHOD_LABELS, type Job, type Milestone } from '../lib/types';

type JobRow = Job & {
  clients: { name: string } | null;
  changes: { status: string; price_cents: number }[];
  payment_milestones: Milestone[];
};

type Row = Milestone & { job: JobRow };

const DAY = 24 * 60 * 60 * 1000;

export function Money() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('jobs')
      .select('*, clients(name), changes(status, price_cents), payment_milestones(*)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        else setJobs((data as JobRow[]) ?? []);
      });
  }, []);

  if (!jobs) {
    return (
      <Page>
        <h1>Money</h1>
        <ErrorNote message={error} />
        {!error && <Loading />}
      </Page>
    );
  }

  const rows: Row[] = jobs.flatMap((job) => job.payment_milestones.map((m) => ({ ...m, job })));
  const requested = rows.filter((r) => r.status === 'requested');
  // The next upcoming payment on each active job.
  const next = jobs
    .filter((j) => j.status === 'active')
    .map((j) => {
      const m = [...j.payment_milestones].sort((a, b) => a.position - b.position).find((x) => x.status === 'upcoming');
      return m ? { ...m, job: j } : null;
    })
    .filter((r): r is Row => r !== null);
  const paidRecently = rows
    .filter((r) => r.status === 'paid' && r.paid_at && Date.now() - new Date(r.paid_at).getTime() < 30 * DAY)
    .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));
  const holdbacks = jobs.filter((j) => Number(j.holdback_rate) > 0);

  const owed = requested.reduce((t, r) => t + r.amount_cents, 0);
  const paidThisMonth = paidRecently.reduce((t, r) => t + r.amount_cents, 0);

  return (
    <Page>
      <h1>Money</h1>
      <div className="card hero-card">
        <span className="small">Requested, waiting on payment</span>
        <span className="hero-number">{formatMoney(owed)}</span>
        <span className="small">
          {requested.length === 1 ? '1 payment request' : `${requested.length} payment requests`} · before HST
        </span>
      </div>

      {requested.length > 0 && (
        <section className="stack">
          <h2>Waiting on payment</h2>
          <ul className="card rows">
            {requested.map((r) => (
              <MoneyRow key={r.id} row={r} detail={`Requested ${formatWhen(r.requested_at)}`} />
            ))}
          </ul>
        </section>
      )}

      <section className="stack">
        <h2>Up next</h2>
        {next.length === 0 ? (
          <p className="muted">
            No upcoming payments. Set up a payment schedule from a job’s Payments tab.
          </p>
        ) : (
          <ul className="card rows">
            {next.map((r) => (
              <MoneyRow key={r.id} row={r} detail={r.due_note ?? 'Next payment'} />
            ))}
          </ul>
        )}
      </section>

      {paidRecently.length > 0 && (
        <section className="stack">
          <div className="title-row">
            <h2>Paid, last 30 days</h2>
            <span className="money">{formatMoney(paidThisMonth)}</span>
          </div>
          <ul className="card rows">
            {paidRecently.map((r) => (
              <MoneyRow
                key={r.id}
                row={r}
                detail={`Paid ${formatWhen(r.paid_at)}${r.paid_method ? ` · ${PAID_METHOD_LABELS[r.paid_method]}` : ''}`}
              />
            ))}
          </ul>
        </section>
      )}

      {holdbacks.length > 0 && (
        <section className="stack">
          <h2>Holdbacks</h2>
          <ul className="card rows">
            {holdbacks.map((j) => {
              const amount = holdbackCents(jobTotals(j.contract_cents, j.tax_rate, j.changes).subtotalCents, j.holdback_rate);
              return (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}?tab=payments`} className="row-link">
                    <span className="row-main">
                      <strong>{j.title}</strong>
                      <span className="muted small">
                        {j.holdback_released_at
                          ? `Released ${formatWhen(j.holdback_released_at)}`
                          : j.holdback_release_date
                            ? `Release ${new Date(j.holdback_release_date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'No release date set'}
                      </span>
                    </span>
                    <span className="money">{formatMoney(amount)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Page>
  );
}

function MoneyRow({ row, detail }: { row: Row; detail: string }) {
  return (
    <li>
      <Link to={`/jobs/${row.job.id}?tab=payments`} className="row-link">
        <span className="row-main">
          <strong>
            {row.job.title} · {row.title}
          </strong>
          <span className="muted small">
            {row.job.clients?.name} · {detail}
          </span>
        </span>
        <span className="money">{formatMoney(row.amount_cents)}</span>
      </Link>
    </li>
  );
}
