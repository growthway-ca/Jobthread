import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatWhenSentence } from '../lib/format';
import { formatMoney, taxCents, taxLabel } from '../lib/money';
import { smsHref } from '../lib/sms';
import { ErrorNote, Header, Loading } from '../components/Layout';
import type { ClientChange } from '../lib/types';

// PLACEHOLDER WORDING. Have a lawyer review before relying on it. Don't
// describe the approval as legally binding anywhere in the UI.
const APPROVAL_WORDING =
  'By approving, you’re saying yes to this change and its price being added to your job.';

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; change: ClientChange };

export function Approve() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    supabase.rpc('get_change_by_token', { p_token: token }).then(({ data, error }) => {
      if (error) return setState({ kind: 'error' });
      const row = (data as ClientChange[] | null)?.[0];
      setState(row ? { kind: 'ready', change: row } : { kind: 'missing' });
    });
  }, [token]);

  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow">
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'missing' && (
          <Message title="This link doesn’t work">
            It may have been typed wrong or cut off. Ask your contractor to send it again.
          </Message>
        )}
        {state.kind === 'error' && (
          <Message title="We couldn’t load this">Check your connection and refresh the page.</Message>
        )}
        {state.kind === 'ready' && (
          <ChangeView token={token} change={state.change} onChange={(change) => setState({ kind: 'ready', change })} />
        )}
      </main>
    </>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card pad-card">
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}

function ChangeView({
  token,
  change,
  onChange,
}: {
  token: string;
  change: ClientChange;
  onChange: (c: ClientChange) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState(false);

  if (change.status === 'void') {
    return (
      <Message title="This change was cancelled">
        {change.business_name} cancelled this change, so there’s nothing to approve. If they sent you a new one, use
        the link in that text.
      </Message>
    );
  }

  const price = change.price_cents ?? 0;
  const tax = taxCents(price, change.tax_rate ?? 0);
  const question = smsHref(change.contractor_phone, `Hi, a question about change #${change.number}: `);

  async function approve(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Type your full name to confirm.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('approve_change', { p_token: token, p_name: name });
    setBusy(false);
    if (error) {
      if (error.message === 'voided') return setError('This change was cancelled and can’t be approved.');
      if (error.message === 'name_required') return setError('Type your full name to confirm.');
      return setError('That didn’t go through. Check your connection and try again.');
    }
    const row = (data as ClientChange[] | null)?.[0];
    if (row) {
      setJustApproved(true);
      onChange(row);
      window.scrollTo(0, 0);
    }
  }

  return (
    <div className="stack">
      {change.status === 'approved' && (
        <div className="card approved-banner" role="status">
          <h1>{justApproved ? 'Approved. Thank you.' : 'Approved'}</h1>
          <p>
            Approved by <strong>{change.approved_name}</strong> on {formatWhenSentence(change.approved_at)}
          </p>
          <p className="small">{change.business_name} can see this approval. You can close this page.</p>
        </div>
      )}

      <div className="card pad-card">
        <p className="from">From {change.business_name}</p>
        <h1 className={change.status === 'approved' ? 'h2' : undefined}>
          Change #{change.number} for your {change.job_title}
        </h1>
        {change.job_address && <p className="muted">{change.job_address}</p>}
        <p className="change-desc">{change.description}</p>
        <div className="totals">
          <div className="line">
            <span>Price</span>
            <span className="money">{formatMoney(price, { alwaysCents: true })}</span>
          </div>
          <div className="line">
            <span>{taxLabel(change.tax_rate ?? 0)}</span>
            <span className="money">{formatMoney(tax, { alwaysCents: true })}</span>
          </div>
          <div className="line grand">
            <span>Total for this change</span>
            <span className="money">{formatMoney(price + tax, { alwaysCents: true })}</span>
          </div>
          {change.time_added && (
            <div className="line">
              <span>Time added</span>
              <span>{change.time_added}</span>
            </div>
          )}
        </div>
      </div>

      {change.status === 'sent' &&
        (confirming ? (
          <form onSubmit={approve} className="stack card pad-card">
            <label className="field">
              <span>Type your full name to confirm</span>
              <input
                autoComplete="name"
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <p className="small muted">{APPROVAL_WORDING}</p>
            <ErrorNote message={error} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Approving…' : 'Confirm approval'}
            </button>
            <button type="button" className="btn plain" onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </form>
        ) : (
          <button type="button" className="btn primary" onClick={() => setConfirming(true)}>
            Approve
          </button>
        ))}

      {change.status === 'declined' && (
        <Message title="Declined">This change was declined.</Message>
      )}

      <a href={question} className="btn secondary">
        Ask a question
      </a>
    </div>
  );
}
