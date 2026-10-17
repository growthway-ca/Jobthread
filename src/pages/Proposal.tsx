import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatWhenSentence } from '../lib/format';
import { formatMoney, taxCents, taxLabel } from '../lib/money';
import { smsHref } from '../lib/sms';
import { ErrorNote, Header, Loading } from '../components/Layout';
import type { ClientQuote } from '../lib/types';

// PLACEHOLDER WORDING. Have a lawyer review before relying on it. Don't
// describe acceptance as legally binding anywhere in the UI.
const ACCEPT_WORDING =
  'By accepting, you’re saying yes to this quote with the options you picked, at the price shown.';

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; quote: ClientQuote };

/** Public page a client opens from the quote text (/p/:token). No sign-in. */
export function Proposal() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    supabase.rpc('get_quote_by_token', { p_token: token }).then(({ data, error }) => {
      if (error) return setState({ kind: 'error' });
      setState(data ? { kind: 'ready', quote: data as ClientQuote } : { kind: 'missing' });
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
          <QuoteView token={token} quote={state.quote} onChange={(quote) => setState({ kind: 'ready', quote })} />
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

function QuoteView({ token, quote, onChange }: { token: string; quote: ClientQuote; onChange: (q: ClientQuote) => void }) {
  const options = quote.options ?? [];
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(options.filter((o) => (quote.status === 'accepted' ? o.selected : o.recommended)).map((o) => o.id)),
  );
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  const question = smsHref(
    quote.contractor_phone,
    quote.number ? `Hi, a question about quote #${quote.number}: ` : 'Hi, a question about your quote: ',
  );

  if (quote.status === 'withdrawn') {
    return (
      <div className="stack">
        <Message title="This quote was replaced">
          {quote.business_name} withdrew this quote. If they sent you an updated one, use the link in that text.
        </Message>
        <a href={question} className="btn secondary">
          Ask a question
        </a>
      </div>
    );
  }
  if (quote.status === 'lost') {
    return (
      <div className="stack">
        <Message title="This quote is closed">
          Want to go ahead after all? Text {quote.business_name} and they can send a fresh one.
        </Message>
        <a href={question} className="btn secondary">
          Text {quote.business_name}
        </a>
      </div>
    );
  }

  const accepted = quote.status === 'accepted';
  const open = quote.status === 'sent' && !quote.expired;
  const base = quote.base_cents ?? 0;
  const subtotal = base + options.filter((o) => picked.has(o.id)).reduce((t, o) => t + o.price_cents, 0);
  const tax = taxCents(subtotal, quote.tax_rate ?? 0);
  const total = subtotal + tax;
  const depositRate = Number(quote.deposit_rate ?? 0);
  const scopeLines = (quote.scope ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  function toggle(id: string) {
    if (!open) return;
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Type your full name to confirm.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('accept_quote', {
      p_token: token,
      p_name: name,
      p_option_ids: Array.from(picked),
    });
    setBusy(false);
    if (error) {
      if (error.message === 'expired') return setError('This quote has expired. Ask for an updated one.');
      if (error.message === 'not_open') return setError('This quote is no longer open.');
      if (error.message === 'name_required') return setError('Type your full name to confirm.');
      return setError('That didn’t go through. Check your connection and try again.');
    }
    if (data) {
      setJustAccepted(true);
      onChange(data as ClientQuote);
      window.scrollTo(0, 0);
    }
  }

  return (
    <div className="stack">
      {accepted && (
        <div className="card approved-banner" role="status">
          <h1>{justAccepted ? 'Accepted. Thank you.' : 'Accepted'}</h1>
          <p>
            Accepted by <strong>{quote.accepted_name}</strong> on {formatWhenSentence(quote.accepted_at ?? null)}
          </p>
          <p className="small">{quote.business_name} can see this and will be in touch to book the work.</p>
        </div>
      )}

      <div className="proposal-head">
        <p className="from">{quote.business_name}</p>
        <h1 className={accepted ? 'h2' : undefined}>{quote.title}</h1>
        <p className="muted">
          {quote.client_name ? `For ${quote.client_name}` : ''}
          {quote.address ? ` · ${quote.address}` : ''}
          {quote.valid_until && !accepted
            ? ` · good until ${new Date(quote.valid_until + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
            : ''}
        </p>
      </div>

      {quote.expired && !accepted && (
        <p className="notice">
          This quote expired. Prices may have changed, so ask {quote.business_name} for an updated one.
        </p>
      )}

      {scopeLines.length > 0 && (
        <ul className="checklist">
          {scopeLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      <div className="card option-list">
        <div className="option-line base">
          <strong>Base price</strong>
          <span className="money">{formatMoney(base, { alwaysCents: true })}</span>
        </div>
        {options.length > 0 && <h2 className="option-heading">{open ? 'Pick your options' : 'Options'}</h2>}
        {options.map((o) => {
          const on = picked.has(o.id);
          return (
            <label key={o.id} className={`option-line ${on ? 'on' : ''} ${open ? '' : 'locked'}`}>
              <input type="checkbox" checked={on} disabled={!open} onChange={() => toggle(o.id)} />
              <span className="option-text">
                <strong>{o.title}</strong>
                {o.detail && <span className="muted small">{o.detail}</span>}
              </span>
              <span className="money">+{formatMoney(o.price_cents, { alwaysCents: true })}</span>
            </label>
          );
        })}
      </div>

      <div className="card dark-total">
        <div className="line">
          <span>Subtotal</span>
          <span className="money">{formatMoney(subtotal, { alwaysCents: true })}</span>
        </div>
        <div className="line">
          <span>{taxLabel(quote.tax_rate ?? 0)}</span>
          <span className="money">{formatMoney(tax, { alwaysCents: true })}</span>
        </div>
        <div className="line big">
          <span>Total</span>
          <span className="money">{formatMoney(total, { alwaysCents: true })}</span>
        </div>
        {depositRate > 0 && (
          <p className="small">
            {Math.round(depositRate * 100)}% to book ({formatMoney(Math.round(subtotal * depositRate), { alwaysCents: true })}{' '}
            + HST), then payments as the work goes.
          </p>
        )}
      </div>

      {open &&
        (confirming ? (
          <form onSubmit={accept} className="stack card pad-card">
            <label className="field">
              <span>Type your full name to accept</span>
              <input autoComplete="name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="small muted">{ACCEPT_WORDING}</p>
            <ErrorNote message={error} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Accepting…' : `Accept for ${formatMoney(total, { alwaysCents: true })}`}
            </button>
            <button type="button" className="btn plain" onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </form>
        ) : (
          <button type="button" className="btn primary" onClick={() => setConfirming(true)}>
            Accept this quote
          </button>
        ))}

      <a href={question} className="btn secondary">
        Ask a question
      </a>
    </div>
  );
}
