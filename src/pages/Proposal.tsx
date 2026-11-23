import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatWhenSentence } from '../lib/format';
import { formatMoney, taxCents, taxLabel } from '../lib/money';
import { firstName, midSentence, smsHref } from '../lib/sms';
import { quotePhotoUrl } from '../lib/photos';
import { choiceGroups, isRealSignature, pickedSubtotal, priceTag, startingPicks, strokesToPath, tapOption } from '../lib/quotes';
import { ErrorNote, Header, Loading } from '../components/Layout';
import { SignaturePad, SignatureView } from '../components/SignaturePad';
import type { ClientQuote } from '../lib/types';

// PLACEHOLDER WORDING. Have a lawyer review before relying on it. Don't
// describe acceptance as legally binding anywhere in the UI.
const ACCEPT_WORDING =
  'By signing, you’re saying yes to this quote with the options you picked, at the price shown.';

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; quote: ClientQuote };
type Option = NonNullable<ClientQuote['options']>[number];

/** Public page a client opens from the quote text (/p/:token). No sign-in. */
export function Proposal() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // The contractor previewing their own proposal isn't counted as the client.
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    supabase.rpc('get_quote_by_token', { p_token: token }).then(({ data, error }) => {
      if (error) return setState({ kind: 'error' });
      setState(data ? { kind: 'ready', quote: data as ClientQuote } : { kind: 'missing' });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) return;
      setIsClient(true);
      void supabase.rpc('record_quote_view', { p_token: token });
    });
  }, [token]);

  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow live-quote">
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
          <QuoteView
            token={token}
            quote={state.quote}
            isClient={isClient}
            onChange={(quote) => setState({ kind: 'ready', quote })}
          />
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

/** Counts quickly to a new value, so the price visibly moves when an option is tapped. */
function useTween(value: number, ms = 350): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    if (begin === value || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(begin + (value - begin) * eased);
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

function QuoteView({
  token,
  quote,
  isClient,
  onChange,
}: {
  token: string;
  quote: ClientQuote;
  isClient: boolean;
  onChange: (q: ClientQuote) => void;
}) {
  const options = quote.options ?? [];
  const accepted = quote.status === 'accepted';
  const [picked, setPicked] = useState<Set<string>>(() => startingPicks(options, accepted));
  const [name, setName] = useState('');
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSigned, setJustSigned] = useState(false);
  const signRef = useRef<HTMLFormElement>(null);

  const base = quote.base_cents ?? 0;
  const subtotal = pickedSubtotal(base, options, picked);
  const tax = taxCents(subtotal, quote.tax_rate ?? 0);
  const total = subtotal + tax;
  const shownTotal = useTween(total);

  const contractorFirst = firstName(quote.contractor_name ?? '') || quote.business_name;
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

  const open = quote.status === 'sent' && !quote.expired;
  const depositRate = Number(quote.deposit_rate ?? 0);
  const depositCents = Math.round(subtotal * depositRate);
  const scopeLines = (quote.scope ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const packages = options.filter((o) => o.kind === 'package');
  const groups = choiceGroups(options);
  const addons = options.filter((o) => o.kind === 'addon');
  const hasChoices = packages.length + groups.length + addons.length > 0;
  const clientFirst = firstName(quote.client_name ?? '');

  function tap(o: Option) {
    if (!open) return;
    const next = tapOption(picked, options, o.id);
    if (next === picked) return;
    setPicked(next);
    const on = next.has(o.id);
    // Only real changes are worth logging: re-tapping the picked choice isn't one.
    if (isClient && (o.kind === 'addon' || !picked.has(o.id))) {
      void supabase.rpc('record_quote_pick', {
        p_token: token,
        p_option_id: o.id,
        p_on: on,
        p_total_cents: pickedSubtotal(base, options, next),
      });
    }
  }

  async function sign(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Type your full name.');
    if (!isRealSignature(strokes)) return setError('Sign in the box with your finger.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('accept_quote', {
      p_token: token,
      p_name: name,
      p_option_ids: Array.from(picked),
      p_signature: strokesToPath(strokes),
    });
    setBusy(false);
    if (error) {
      if (error.message === 'expired') return setError('This quote has expired. Ask for an updated one.');
      if (error.message === 'not_open') return setError('This quote is no longer open.');
      if (error.message === 'name_required') return setError('Type your full name.');
      if (error.message === 'pick_package') return setError('Pick one of the packages first.');
      if (error.message === 'pick_choice') return setError('Pick one option in each section first.');
      if (error.message === 'bad_signature') return setError('Clear the signature and sign again.');
      return setError('That didn’t go through. Check your connection and try again.');
    }
    if (data) {
      setJustSigned(true);
      onChange(data as ClientQuote);
      window.scrollTo(0, 0);
    }
  }

  return (
    <div className="stack live-stack">
      {accepted && (
        <SignedCard
          quote={quote}
          justSigned={justSigned}
          depositCents={depositCents}
          contractorFirst={contractorFirst}
          question={question}
        />
      )}

      <div className="lq-head">
        <div className="lq-from">
          <span className="lq-avatar" aria-hidden="true">
            {initials(quote.business_name)}
          </span>
          <span>
            <span className="lq-business">{quote.business_name}</span>
            {(quote.google_rating || quote.credentials) && (
              <span className="trust-line">
                {quote.google_rating ? (
                  <>
                    <span className="stars" aria-hidden="true">
                      ★
                    </span>{' '}
                    {Number(quote.google_rating).toFixed(1)}
                    {quote.google_review_count ? ` from ${quote.google_review_count} reviews` : ' on Google'}
                  </>
                ) : null}
                {quote.google_rating && quote.credentials ? ' · ' : ''}
                {quote.credentials}
              </span>
            )}
          </span>
        </div>
        <p className="lq-kicker">
          Your quote{quote.number ? ` #${quote.number}` : ''}
          {quote.address ? ` · ${quote.address}` : ''}
        </p>
        <h1>
          Your {midSentence(quote.title ?? 'quote')}
          {clientFirst ? `, ${clientFirst}.` : '.'}
        </h1>
        {quote.valid_until && !accepted && (
          <p className="muted small">
            Good until{' '}
            {new Date(quote.valid_until + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>

      {quote.photos && quote.photos.length > 0 && <PhotoHero photos={quote.photos} />}

      {quote.expired && !accepted && (
        <p className="notice">
          This quote expired. Prices may have changed, so ask {quote.business_name} for an updated one.
        </p>
      )}

      {scopeLines.length > 0 && (
        <section className="stack-tight">
          <h2>What’s included</h2>
          <ul className="checklist">
            {scopeLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {hasChoices && (
        <section className="card lq-choices">
          <div className="lq-choices-head">
            <h2>{open ? 'Make it yours' : 'What you picked'}</h2>
            <span className="lq-price">
              <span className="small muted">{accepted ? 'Your price' : 'Your price, incl. HST'}</span>
              <span className="lq-price-number" aria-live="polite">
                {formatMoney(shownTotal)}
              </span>
            </span>
          </div>

          {packages.length > 0 && (
            <div className="lq-group">
              <p className="lq-group-label">Package</p>
              <div className="lq-tiles" role="radiogroup" aria-label="Package">
                {packages.map((o) => (
                  <Tile key={o.id} option={o} on={picked.has(o.id)} open={open} onTap={() => tap(o)}>
                    <span className="lq-tile-price">{formatMoney(base + o.price_cents)}</span>
                  </Tile>
                ))}
              </div>
            </div>
          )}

          {groups.map((g) => {
            const current = g.options.find((o) => picked.has(o.id));
            const swatches = g.options.every((o) => o.swatch);
            return (
              <div key={g.name} className="lq-group">
                <p className="lq-group-label">
                  {g.name}
                  {current && <span className="muted">{current.title}</span>}
                </p>
                {swatches ? (
                  <div className="lq-swatches" role="radiogroup" aria-label={g.name}>
                    {g.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={picked.has(o.id)}
                        aria-label={`${o.title}${o.price_cents ? `, ${priceTag(o.price_cents, formatMoney)}` : ''}`}
                        className={`lq-swatch ${picked.has(o.id) ? 'on' : ''}`}
                        style={{ background: o.swatch ?? undefined }}
                        disabled={!open}
                        onClick={() => tap(o)}
                      />
                    ))}
                    {current && current.price_cents !== 0 && (
                      <span className="small muted">{priceTag(current.price_cents, formatMoney)}</span>
                    )}
                  </div>
                ) : (
                  <div className="lq-tiles" role="radiogroup" aria-label={g.name}>
                    {g.options.map((o) => (
                      <Tile key={o.id} option={o} on={picked.has(o.id)} open={open} onTap={() => tap(o)}>
                        <span className="lq-tile-price">{priceTag(o.price_cents, formatMoney)}</span>
                      </Tile>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {addons.length > 0 && (
            <div className="lq-group">
              <p className="lq-group-label">Add-ons</p>
              <ul className="lq-addons">
                {addons.map((o) => {
                  const on = picked.has(o.id);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        className={`lq-addon ${on ? 'on' : ''}`}
                        disabled={!open}
                        onClick={() => tap(o)}
                      >
                        <span className="lq-addon-text">
                          <strong>{o.title}</strong>
                          {o.detail && <span className="muted small">{o.detail}</span>}
                        </span>
                        <span className="lq-addon-price">+{formatMoney(o.price_cents)}</span>
                        <span className="lq-switch" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="card totals lq-breakdown">
        <div className="line">
          <span>{packages.length ? 'Included in every package' : (quote.title ?? 'Base price')}</span>
          <span className="money">{formatMoney(base, { alwaysCents: true })}</span>
        </div>
        {options
          .filter((o) => picked.has(o.id) && o.price_cents !== 0)
          .map((o) => (
            <div className="line" key={o.id}>
              <span>{o.group_name ? `${o.group_name}: ${o.title}` : o.title}</span>
              <span className="money">{priceTag(o.price_cents, (c) => formatMoney(c, { alwaysCents: true }))}</span>
            </div>
          ))}
        <div className="line rule">
          <span>Subtotal</span>
          <span className="money">{formatMoney(subtotal, { alwaysCents: true })}</span>
        </div>
        <div className="line">
          <span>{taxLabel(quote.tax_rate ?? 0)}</span>
          <span className="money">{formatMoney(tax, { alwaysCents: true })}</span>
        </div>
        <div className="line grand">
          <span>Total, HST included</span>
          <span className="money">{formatMoney(total, { alwaysCents: true })}</span>
        </div>
      </div>

      {open && (
        <form ref={signRef} onSubmit={sign} className="card pad-card stack lq-sign" id="sign">
          <div className="lq-sign-head">
            <h2>Sign and book</h2>
            {depositRate > 0 && <span className="pill">{Math.round(depositRate * 100)}% deposit</span>}
          </div>
          <label className="field">
            <span>Your full name</span>
            <input autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <SignaturePad onChange={setStrokes} disabled={busy} />
          <p className="small muted">{ACCEPT_WORDING}</p>
          {depositRate > 0 && (
            <div className="line lq-deposit">
              <span>Deposit to book</span>
              <span className="money">
                {formatMoney(depositCents + taxCents(depositCents, quote.tax_rate ?? 0), { alwaysCents: true })}
              </span>
            </div>
          )}
          <ErrorNote message={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Signing…' : `Sign for ${formatMoney(total, { alwaysCents: true })}`}
          </button>
          {depositRate > 0 && (
            <p className="small muted center">
              The rest is paid as the work goes, on the schedule {contractorFirst} sets up with you.
            </p>
          )}
        </form>
      )}

      <a href={question} className="btn secondary">
        Questions? Text {contractorFirst}
      </a>

      {open && (
        <div className="lq-bar" role="region" aria-label="Your price">
          <span>
            <span className="small">Your price, incl. HST</span>
            <span className="lq-bar-number">{formatMoney(shownTotal)}</span>
          </span>
          <button
            type="button"
            className="btn primary small"
            onClick={() => signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Sign and book
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({
  option: o,
  on,
  open,
  onTap,
  children,
}: {
  option: Option;
  on: boolean;
  open: boolean;
  onTap: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={`lq-tile ${on ? 'on' : ''}`}
      disabled={!open}
      onClick={onTap}
    >
      <strong>{o.title}</strong>
      {o.detail && <span className="muted small">{o.detail}</span>}
      {children}
    </button>
  );
}

function PhotoHero({ photos }: { photos: NonNullable<ClientQuote['photos']> }) {
  const [index, setIndex] = useState(0);
  const photo = photos[Math.min(index, photos.length - 1)];
  return (
    <figure className="lq-hero">
      <img
        src={quotePhotoUrl(photo.path)}
        alt={photo.label ?? 'Photo of the space'}
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
      />
      {photos.length > 1 && (
        <div className="lq-hero-tabs" role="tablist" aria-label="Photos">
          {photos.map((p, i) => (
            <button
              key={p.path}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={i === index ? 'on' : ''}
              onClick={() => setIndex(i)}
            >
              {p.label || `Photo ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {photos.length === 1 && photo.label && <figcaption>{photo.label}</figcaption>}
    </figure>
  );
}

function SignedCard({
  quote,
  justSigned,
  depositCents,
  contractorFirst,
  question,
}: {
  quote: ClientQuote;
  justSigned: boolean;
  depositCents: number;
  contractorFirst: string;
  question: string;
}) {
  const depositWithTax = depositCents + taxCents(depositCents, quote.tax_rate ?? 0);
  return (
    <div className="card lq-signed" role="status">
      <span className="lq-signed-tick" aria-hidden="true" />
      <h1>{justSigned ? 'Signed. You’re booked in.' : 'Signed'}</h1>
      <p>
        Signed by <strong>{quote.accepted_name}</strong> on {formatWhenSentence(quote.accepted_at ?? null)}
      </p>
      {quote.accepted_signature && <SignatureView path={quote.accepted_signature} label={`Signature of ${quote.accepted_name}`} />}
      {depositCents > 0 && (
        <div className="lq-deposit-due">
          <span>Deposit to book</span>
          <strong>{formatMoney(depositWithTax, { alwaysCents: true })}</strong>
          <span className="small">
            {quote.etransfer_email
              ? `Send it by e-Transfer to ${quote.etransfer_email}.`
              : `${contractorFirst} will tell you how to pay it.`}
          </span>
        </div>
      )}
      <p className="small">{quote.business_name} has your signed quote and will be in touch to book the work.</p>
      <a href={question} className="btn secondary">
        Questions? Text {contractorFirst}
      </a>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

