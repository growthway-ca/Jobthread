import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage, formatWhen } from '../lib/format';
import { formatMoney, holdbackCents, jobTotals, parseDollars, paymentTotals } from '../lib/money';
import { firstName, paymentRequestMessage } from '../lib/sms';
import type { JobData } from '../lib/useJob';
import { PAID_METHOD_LABELS, type Milestone, type PaidMethod } from '../lib/types';
import { ErrorNote } from './Layout';
import { SendActions } from './SendActions';

const STATUS_LABEL = { upcoming: 'Upcoming', requested: 'Requested', paid: 'Paid' } as const;

export function PaymentsTab({ data, reload }: { data: JobData; reload: () => Promise<void> }) {
  const { job, changes, milestones } = data;
  const totals = jobTotals(job.contract_cents, job.tax_rate, changes);
  const pay = paymentTotals(totals.subtotalCents, milestones);

  return (
    <section aria-label="Payments" className="stack">
      <div className="card totals">
        <div className="line">
          <span>Job total, before HST</span>
          <span className="money">{formatMoney(totals.subtotalCents, { alwaysCents: true })}</span>
        </div>
        <div className="line">
          <span>Paid</span>
          <span className="money">{formatMoney(pay.paidCents, { alwaysCents: true })}</span>
        </div>
        <div className="line grand">
          <span>Left to pay</span>
          <span className="money">{formatMoney(pay.leftCents, { alwaysCents: true })}</span>
        </div>
      </div>

      {milestones.length > 0 && pay.unscheduledCents !== 0 && (
        <p className="notice">
          {pay.unscheduledCents > 0
            ? `${formatMoney(pay.unscheduledCents, { alwaysCents: true })} of the job total isn’t in a payment yet.`
            : `The payments add up to ${formatMoney(-pay.unscheduledCents, { alwaysCents: true })} more than the job total.`}
        </p>
      )}

      {milestones.length === 0 && (
        <p className="muted">
          Set up the payment schedule for this job: a deposit, then a payment at each stage. When a stage is done,
          tap Request and JobThread writes the text.
        </p>
      )}

      <ol className="milestones">
        {milestones.map((m) => (
          <li key={m.id}>
            <MilestoneRow milestone={m} data={data} reload={reload} />
          </li>
        ))}
      </ol>

      <AddMilestone jobId={job.id} suggestedCents={pay.unscheduledCents} reload={reload} />
      <HoldbackCard data={data} subtotalCents={totals.subtotalCents} reload={reload} />
    </section>
  );
}

function MilestoneRow({ milestone: m, data, reload }: { milestone: Milestone; data: JobData; reload: () => Promise<void> }) {
  const { contractor } = useAuth();
  const [mode, setMode] = useState<'idle' | 'paying' | 'sending'>('idle');
  const [method, setMethod] = useState<PaidMethod>('etransfer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = paymentRequestMessage({
    clientName: data.client.name,
    jobTitle: data.job.title,
    title: m.title,
    amountCents: m.amount_cents,
    taxRate: data.job.tax_rate,
    etransferEmail: contractor?.etransfer_email ?? null,
  });

  async function update(values: Partial<Milestone>, next: typeof mode = 'idle') {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('payment_milestones').update(values).eq('id', m.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setMode(next);
    await reload();
  }

  async function remove() {
    if (!window.confirm(`Remove “${m.title}” from the payment schedule?`)) return;
    const { error } = await supabase.from('payment_milestones').delete().eq('id', m.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  const tax = Math.round(m.amount_cents * Number(data.job.tax_rate));

  return (
    <article className={`card milestone ${m.status}`}>
      <div className="milestone-head">
        <span className={`dot ${m.status}`} aria-hidden="true" />
        <div className="milestone-main">
          <strong>{m.title}</strong>
          {m.due_note && <span className="muted small">{m.due_note}</span>}
        </div>
        <div className="milestone-amount">
          <span className="money">{formatMoney(m.amount_cents, { alwaysCents: true })}</span>
          <span className="muted small">+ {formatMoney(tax, { alwaysCents: true })} HST</span>
        </div>
      </div>
      <p className={`milestone-status ${m.status}`}>
        {m.status === 'paid'
          ? `Paid ${formatWhen(m.paid_at)}${m.paid_method ? ` · ${PAID_METHOD_LABELS[m.paid_method]}` : ''}`
          : m.status === 'requested'
            ? `Requested ${formatWhen(m.requested_at)} · waiting on ${firstName(data.client.name)}`
            : STATUS_LABEL[m.status]}
      </p>

      {m.status !== 'paid' && mode === 'paying' && (
        <div className="stack">
          <p className="small strong">How was it paid?</p>
          <div className="chips">
            {(Object.keys(PAID_METHOD_LABELS) as PaidMethod[]).map((k) => (
              <button
                key={k}
                type="button"
                className={method === k ? 'chip selected' : 'chip'}
                aria-pressed={method === k}
                onClick={() => setMethod(k)}
              >
                {PAID_METHOD_LABELS[k]}
              </button>
            ))}
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn small"
              disabled={busy}
              onClick={() => void update({ status: 'paid', paid_method: method })}
            >
              Mark paid
            </button>
            <button type="button" className="btn small plain" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {m.status === 'upcoming' && mode !== 'paying' && (
        <div className="row-actions">
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => void update({ status: 'requested' }, 'sending')}
          >
            Request
          </button>
          <button type="button" className="btn small plain" onClick={() => setMode('paying')}>
            Mark paid
          </button>
          <button type="button" className="btn small plain danger" onClick={() => void remove()}>
            Remove
          </button>
        </div>
      )}

      {m.status === 'requested' && mode !== 'paying' && (
        <>
          {mode === 'sending' && (
            <div className="card sms-preview small-preview" aria-label="Text message">
              {message}
            </div>
          )}
          <SendActions
            phone={data.client.phone}
            message={message}
            label={mode === 'sending' ? 'Open Messages' : 'Resend'}
            compact
          >
            <button type="button" className="btn small plain" onClick={() => setMode('paying')}>
              Mark paid
            </button>
            <button
              type="button"
              className="btn small plain"
              disabled={busy}
              onClick={() => void update({ status: 'upcoming' })}
            >
              Cancel request
            </button>
          </SendActions>
          {!contractor?.etransfer_email && (
            <p className="muted small">
              Add your e-Transfer email in <Link to="/settings">Settings</Link> and it goes in the text.
            </p>
          )}
        </>
      )}
      <ErrorNote message={error} />
    </article>
  );
}

function AddMilestone({
  jobId,
  suggestedCents,
  reload,
}: {
  jobId: string;
  suggestedCents: number;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueNote, setDueNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollars(amount);
    if (cents === null || cents <= 0) return setError('Enter the amount in dollars, before tax.');
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('payment_milestones')
      .insert({ job_id: jobId, title: title.trim(), amount_cents: cents, due_note: dueNote.trim() || null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setTitle('');
    setAmount('');
    setDueNote('');
    setOpen(false);
    await reload();
  }

  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Add a payment
      </button>
    );
  }

  return (
    <form onSubmit={add} className="card pad-card stack">
      <h2>Add a payment</h2>
      <label className="field">
        <span>What it’s for</span>
        <input required maxLength={120} placeholder="Rough-ins and inspections" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Amount, before tax</span>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          <input
            inputMode="decimal"
            required
            placeholder={suggestedCents > 0 ? (suggestedCents / 100).toFixed(2) : undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </label>
      <label className="field">
        <span>When it’s due</span>
        <input maxLength={200} placeholder="When ESA and plumbing inspections pass" value={dueNote} onChange={(e) => setDueNote(e.target.value)} />
      </label>
      <ErrorNote message={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add payment'}
      </button>
      <button type="button" className="btn plain" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function HoldbackCard({
  data,
  subtotalCents,
  reload,
}: {
  data: JobData;
  subtotalCents: number;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const { job } = data;
  if (!job.holdback_rate || Number(job.holdback_rate) === 0) {
    return (
      <p className="muted small">
        Holding back 10% until the lien period ends? Turn on the holdback in{' '}
        <Link to={`/jobs/${job.id}/edit`}>Edit job</Link>.
      </p>
    );
  }

  async function release() {
    if (!window.confirm('Mark the holdback as released and paid?')) return;
    const { error } = await supabase
      .from('jobs')
      .update({ holdback_released_at: new Date().toISOString() })
      .eq('id', job.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  const amount = holdbackCents(subtotalCents, job.holdback_rate);
  return (
    <div className="card pad-card stack">
      <div className="title-row">
        <h2>Holdback</h2>
        <span className="money">{formatMoney(amount, { alwaysCents: true })}</span>
      </div>
      <p className="muted small">
        {Math.round(Number(job.holdback_rate) * 100)}% of the job total, before HST.{' '}
        {job.holdback_released_at
          ? `Released ${formatWhen(job.holdback_released_at)}.`
          : job.holdback_release_date
            ? `Due for release ${new Date(job.holdback_release_date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}.`
            : 'Set a release date in Edit job.'}
      </p>
      {!job.holdback_released_at && (
        <button type="button" className="btn small plain" onClick={() => void release()}>
          Mark released
        </button>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
