import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase, approvalLink } from '../lib/supabase';
import { errorMessage, formatWhen } from '../lib/format';
import { formatMoney, jobTotals, paymentTotals, taxLabel } from '../lib/money';
import { changeMessage, firstName, scheduleClause } from '../lib/sms';
import { useJob, type JobData } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';
import { PaymentsTab } from '../components/PaymentsTab';
import { ScheduleTab } from '../components/ScheduleTab';
import type { Change, JobEvent } from '../lib/types';

type Tab = 'thread' | 'schedule' | 'payments' | 'total';
const TABS: { id: Tab; label: string }[] = [
  { id: 'thread', label: 'Thread' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'payments', label: 'Payments' },
  { id: 'total', label: 'Total' },
];

export function JobThread() {
  const { jobId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'thread';
  const showTab = (id: Tab) => setParams(id === 'thread' ? {} : { tab: id }, { replace: true });
  const { data, error, notFound, reload } = useJob(jobId);

  if (notFound) {
    return (
      <Page>
        <p className="center pad">We couldn’t find that job.</p>
        <Link to="/jobs" className="btn secondary">
          Back to jobs
        </Link>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        <ErrorNote message={error} />
        {!error && <Loading />}
      </Page>
    );
  }

  const { job, client } = data;
  return (
    <Page>
      <Link to="/jobs" className="back">
        Back to jobs
      </Link>
      <div className="job-head">
        <div className="title-row">
          <h1>{job.title}</h1>
          <span className="head-links">
            <Link to={`/jobs/${job.id}/share`} className="edit-link">
              Client page
            </Link>
            <Link to={`/jobs/${job.id}/edit`} className="edit-link">
              Edit
            </Link>
          </span>
        </div>
        <p className="muted">
          {client.name}
          {job.address ? ` · ${job.address}` : ''}
        </p>
        {job.status === 'done' && <span className="pill">Done</span>}
      </div>

      <JobSummary data={data} />

      <div className="action-grid">
        <Link to={`/jobs/${job.id}/changes/new`} className="btn primary span-2">
          New change
        </Link>
        <Link to={`/jobs/${job.id}/log/new`} className="btn secondary">
          Daily log
        </Link>
        <Link to={`/jobs/${job.id}/site`} className="btn secondary">
          Job sheets
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => showTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />
      {tab === 'thread' && <Thread data={data} reload={reload} />}
      {tab === 'schedule' && <ScheduleTab data={data} reload={reload} />}
      {tab === 'payments' && <PaymentsTab data={data} reload={reload} />}
      {tab === 'total' && <Totals data={data} />}
      <JobStatusToggle data={data} reload={reload} />
    </Page>
  );
}

function Thread({ data, reload }: { data: JobData; reload: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changesById = new Map(data.changes.map((c) => [c.id, c]));

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('job_events')
      .insert({ job_id: data.job.id, kind: 'note', body: note.trim() });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setNote('');
    await reload();
  }

  return (
    <section aria-label="Job thread">
      <form onSubmit={addNote} className="note-form">
        <label className="field">
          <span>Add a note</span>
          <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {note.trim() && (
          <button className="btn secondary" disabled={busy}>
            {busy ? 'Saving…' : 'Save note'}
          </button>
        )}
        <ErrorNote message={error} />
      </form>

      {data.events.length === 0 && (
        <p className="muted center pad">Nothing here yet. Notes, daily logs, changes and payments show up here.</p>
      )}
      <ol className="thread">
        {data.events.map((ev) => (
          <li key={ev.id}>
            <ThreadItem event={ev} change={ev.change_id ? changesById.get(ev.change_id) : undefined} data={data} reload={reload} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ThreadItem({
  event,
  change,
  data,
  reload,
}: {
  event: JobEvent;
  change?: Change;
  data: JobData;
  reload: () => Promise<void>;
}) {
  if (event.kind === 'daily_log') {
    return <DailyLogItem event={event} data={data} />;
  }

  if (event.kind === 'payment_received' || event.kind === 'quote_accepted') {
    return (
      <article className="card item approved">
        <p className="item-meta">
          {event.kind === 'quote_accepted' ? 'Quote accepted' : 'Paid'} · {formatWhen(event.created_at)}
        </p>
        <p className="item-title">{event.body.replace(/^Payment received: /, '')}</p>
      </article>
    );
  }

  if (event.kind === 'payment_requested') {
    return (
      <article className="card item request">
        <p className="item-meta">Payment requested · {formatWhen(event.created_at)}</p>
        <p className="item-body">{event.body.replace(/^Payment requested: /, '')}</p>
      </article>
    );
  }

  if (event.kind === 'note' || !change) {
    return (
      <article className="card item note">
        <p className="item-meta">Note · {formatWhen(event.created_at)}</p>
        <p className="item-body">{event.body}</p>
      </article>
    );
  }

  if (event.kind === 'change_approved') {
    return (
      <article className="card item approved">
        <p className="item-meta">Approved · {formatWhen(change.approved_at)}</p>
        <p className="item-title">
          Change #{change.number} approved by {change.approved_name}
        </p>
        <p className="item-body">{change.description}</p>
        <p className="item-price">{formatMoney(change.price_cents)} + HST</p>
      </article>
    );
  }

  if (event.kind === 'change_voided' || event.kind === 'change_declined') {
    return (
      <article className="card item muted-item">
        <p className="item-meta">{formatWhen(event.created_at)}</p>
        <p className="item-body">{event.body}</p>
      </article>
    );
  }

  return <SentChange change={change} event={event} data={data} reload={reload} />;
}

function DailyLogItem({ event, data }: { event: JobEvent; data: JobData }) {
  const photos = data.photos.filter((p) => p.event_id === event.id);
  return (
    <article className="card item log">
      <p className="item-meta">Daily log · {formatWhen(event.created_at)}</p>
      <p className="item-body">{event.body}</p>
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p) => {
            const url = data.photoUrls[p.storage_path];
            return url ? (
              <a key={p.id} href={url} target="_blank" rel="noreferrer" className="photo">
                <img src={url} alt="" loading="lazy" width={p.width ?? undefined} height={p.height ?? undefined} />
              </a>
            ) : (
              <span key={p.id} className="photo missing">
                Photo
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}

function SentChange({
  change,
  event,
  data,
  reload,
}: {
  change: Change;
  event: JobEvent;
  data: JobData;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const message = changeMessage({
    clientName: data.client.name,
    number: change.number,
    jobTitle: data.job.title,
    description: change.description,
    priceCents: change.price_cents,
    timeAdded: change.time_added,
    link: approvalLink(change.approval_token),
  });

  async function voidChange() {
    const ok = window.confirm(
      `Void change #${change.number}? Its link will stop working. You can make a new change to replace it.`,
    );
    if (!ok) return;
    const { error } = await supabase.from('changes').update({ status: 'void' }).eq('id', change.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  return (
    <article className={`card item change ${change.status === 'void' ? 'voided' : ''}`}>
      <p className="item-meta">
        Change #{change.number} sent · {formatWhen(event.created_at)}
      </p>
      <p className="item-body">{change.description}</p>
      <p className="item-price">
        {formatMoney(change.price_cents)} + HST
        {scheduleClause(change.time_added) ? ` · ${scheduleClause(change.time_added)}` : ''}
      </p>
      {change.status === 'sent' && (
        <>
          <p className="waiting-line">Waiting on {firstName(data.client.name)}</p>
          <SendActions phone={data.client.phone} message={message} label="Resend" compact>
            <button type="button" className="btn small plain danger" onClick={() => void voidChange()}>
              Void
            </button>
          </SendActions>
        </>
      )}
      {change.status === 'approved' && <span className="pill approved-pill">Approved</span>}
      {change.status === 'void' && <span className="pill">Voided</span>}
      <ErrorNote message={error} />
    </article>
  );
}

/** The numbers a contractor wants at a glance, above the thread. */
function JobSummary({ data }: { data: JobData }) {
  const { job, changes } = data;
  const totals = jobTotals(job.contract_cents, job.tax_rate, changes);
  const approvedCount = changes.filter((c) => c.status === 'approved').length;
  const waiting = changes.filter((c) => c.status === 'sent');
  const pay = paymentTotals(totals.subtotalCents, data.milestones);
  const hasPayments = data.milestones.length > 0;

  return (
    <div className="card summary">
      <div className="summary-line">
        <span>Contract</span>
        <span className="leader" aria-hidden="true" />
        <span className="money">{formatMoney(job.contract_cents)}</span>
      </div>
      <div className="summary-line">
        <span>
          Changes, {approvedCount} approved
        </span>
        <span className="leader" aria-hidden="true" />
        <span className="money">
          {totals.approvedCents < 0 ? '−' : '+'} {formatMoney(Math.abs(totals.approvedCents))}
        </span>
      </div>
      {hasPayments && (
        <div className="summary-line">
          <span>Paid to date</span>
          <span className="leader" aria-hidden="true" />
          <span className="money">− {formatMoney(pay.paidCents)}</span>
        </div>
      )}
      <div className="summary-total">
        <span>{hasPayments ? 'Left to pay' : 'Job total'}</span>
        <span className="money">{formatMoney(hasPayments ? pay.leftCents : totals.subtotalCents)}</span>
      </div>
      <p className="muted small">
        {hasPayments
          ? `All amounts before HST. Job total ${formatMoney(totals.subtotalCents)}.`
          : `Before HST. With HST: ${formatMoney(totals.totalCents, { alwaysCents: true })}`}
      </p>
      {hasPayments && (
        <div className="progress" aria-hidden="true">
          {data.milestones.map((m) => (
            <span key={m.id} className={`seg ${m.status}`} />
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <p className="summary-waiting">
          {waiting.length === 1 ? '1 change' : `${waiting.length} changes`} waiting on{' '}
          {firstName(data.client.name)}, {formatMoney(totals.pendingCents)} not counted yet
        </p>
      )}
    </div>
  );
}

function Totals({ data }: { data: JobData }) {
  const { job, changes } = data;
  const totals = jobTotals(job.contract_cents, job.tax_rate, changes);
  const approved = changes.filter((c) => c.status === 'approved');
  const pending = changes.filter((c) => c.status === 'sent');

  return (
    <section aria-label="Job total" className="stack">
      <div className="card totals">
        <div className="line">
          <span>Original contract</span>
          <span className="money">{formatMoney(job.contract_cents, { alwaysCents: true })}</span>
        </div>
        {approved.map((c) => (
          <div className="line" key={c.id}>
            <span>
              Change #{c.number}: {c.description}
              <span className="muted small block">
                Approved by {c.approved_name}, {formatWhen(c.approved_at)}
              </span>
            </span>
            <span className="money">{formatMoney(c.price_cents, { alwaysCents: true })}</span>
          </div>
        ))}
        <div className="line rule">
          <span>Subtotal</span>
          <span className="money">{formatMoney(totals.subtotalCents, { alwaysCents: true })}</span>
        </div>
        <div className="line">
          <span>{taxLabel(job.tax_rate)}</span>
          <span className="money">{formatMoney(totals.taxCents, { alwaysCents: true })}</span>
        </div>
        <div className="line grand">
          <span>New total</span>
          <span className="money">{formatMoney(totals.totalCents, { alwaysCents: true })}</span>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card totals pending">
          <h2>Waiting on approval</h2>
          <p className="muted small">Not counted in the total until approved.</p>
          {pending.map((c) => (
            <div className="line" key={c.id}>
              <span>
                Change #{c.number}: {c.description}
              </span>
              <span className="money">{formatMoney(c.price_cents, { alwaysCents: true })}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function JobStatusToggle({ data, reload }: { data: JobData; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const done = data.job.status === 'done';

  async function toggle() {
    const { error } = await supabase
      .from('jobs')
      .update({ status: done ? 'active' : 'done' })
      .eq('id', data.job.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  return (
    <div className="footer-actions">
      <button type="button" className="btn plain" onClick={() => void toggle()}>
        {done ? 'Reopen job' : 'Mark job done'}
      </button>
      <ErrorNote message={error} />
    </div>
  );
}
