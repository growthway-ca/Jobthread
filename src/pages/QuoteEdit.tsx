import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { formatMoney, parseDollars } from '../lib/money';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { ClientPicker, resolveClient, type ClientChoice } from '../components/ClientPicker';
import type { Quote, QuoteOption } from '../lib/types';

interface OptionDraft {
  key: string;
  title: string;
  detail: string;
  price: string;
  recommended: boolean;
}

const DEPOSITS = [
  { rate: 0, label: 'None' },
  { rate: 0.05, label: '5%' },
  { rate: 0.1, label: '10%' },
  { rate: 0.25, label: '25%' },
];

function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function blankOption(): OptionDraft {
  return { key: crypto.randomUUID(), title: '', detail: '', price: '', recommended: false };
}

/** New quote, or edit a draft (/quotes/:quoteId/edit). Sent quotes are locked. */
export function QuoteEdit() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [client, setClient] = useState<ClientChoice>({ kind: 'new', name: '', phone: '' });
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [scope, setScope] = useState('');
  const [base, setBase] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [deposit, setDeposit] = useState(0);
  const [validUntil, setValidUntil] = useState(isoDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) return;
    supabase
      .from('quotes')
      .select('*, quote_options(*)')
      .eq('id', quoteId)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) return setError(error ? errorMessage(error) : 'We couldn’t find that quote.');
        const q = data as Quote & { quote_options: QuoteOption[] };
        if (q.status !== 'draft') {
          navigate(`/quotes/${q.id}`, { replace: true });
          return;
        }
        setClient({ kind: 'existing', id: q.client_id });
        setTitle(q.title);
        setAddress(q.address ?? '');
        setScope(q.scope ?? '');
        setBase((q.base_cents / 100).toFixed(2));
        setDeposit(Number(q.deposit_rate));
        setValidUntil(q.valid_until ?? '');
        setOptions(
          [...q.quote_options]
            .sort((a, b) => a.position - b.position)
            .map((o) => ({
              key: o.id,
              title: o.title,
              detail: o.detail ?? '',
              price: (o.price_cents / 100).toFixed(2),
              recommended: o.recommended,
            })),
        );
      });
  }, [quoteId, navigate]);

  function updateOption(key: string, values: Partial<OptionDraft>) {
    setOptions((current) => current.map((o) => (o.key === key ? { ...o, ...values } : o)));
  }

  const baseCents = parseDollars(base) ?? 0;
  const recommendedCents = options
    .filter((o) => o.recommended)
    .reduce((t, o) => t + (parseDollars(o.price) ?? 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    const baseValue = parseDollars(base);
    if (baseValue === null || baseValue < 0) return setError('Enter the base price in dollars, before tax.');
    const cleanOptions = options.filter((o) => o.title.trim() || o.price.trim());
    for (const o of cleanOptions) {
      if (!o.title.trim()) return setError('Give every option a name, or remove it.');
      if (parseDollars(o.price) === null) return setError(`Enter a price for “${o.title.trim()}”.`);
    }
    setBusy(true);
    setError(null);
    try {
      const clientId = await resolveClient(client);
      const values = {
        client_id: clientId,
        title: title.trim(),
        address: address.trim() || null,
        scope: scope.trim() || null,
        base_cents: baseValue,
        deposit_rate: deposit,
        valid_until: validUntil || null,
      };
      let id = quoteId;
      if (id) {
        const { error } = await supabase.from('quotes').update(values).eq('id', id);
        if (error) throw error;
        const { error: delError } = await supabase.from('quote_options').delete().eq('quote_id', id);
        if (delError) throw delError;
      } else {
        id = crypto.randomUUID();
        const { error } = await supabase.from('quotes').insert({ id, ...values, status: 'draft' });
        if (error) throw error;
      }
      if (cleanOptions.length > 0) {
        const { error } = await supabase.from('quote_options').insert(
          cleanOptions.map((o, i) => ({
            quote_id: id,
            position: i + 1,
            title: o.title.trim(),
            detail: o.detail.trim() || null,
            price_cents: parseDollars(o.price) ?? 0,
            recommended: o.recommended,
          })),
        );
        if (error) throw error;
      }
      navigate(`/quotes/${id}`, { replace: true });
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <Page nav={false}>
        <Loading />
      </Page>
    );
  }

  return (
    <Page nav={false}>
      <Link to={quoteId ? `/quotes/${quoteId}` : '/quotes'} className="back">
        {quoteId ? 'Back to the quote' : 'Back to quotes'}
      </Link>
      <h1>{quoteId ? 'Edit quote' : 'New quote'}</h1>
      <form onSubmit={save} className="stack">
        <ClientPicker value={client} onChange={setClient} />
        <label className="field">
          <span>Job</span>
          <input required maxLength={120} placeholder="Basement finish, about 750 sq ft" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Address</span>
          <input maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="field">
          <span>What’s included</span>
          <textarea
            rows={5}
            maxLength={4000}
            placeholder={'Framing, insulation, drywall and paint\nElectrical and two-piece bath by licensed trades\nPermit, drawings and inspections handled'}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
          <span className="hint">One item per line. Each line shows with a checkmark.</span>
        </label>
        <label className="field">
          <span>Base price, before tax</span>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input inputMode="decimal" required value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
        </label>

        <fieldset className="field chips-field">
          <legend>Options the client can add</legend>
          {options.length === 0 && (
            <p className="hint">Upgrades or extras, like an insulated subfloor. The client ticks the ones they want.</p>
          )}
          <div className="stack">
            {options.map((o, i) => (
              <div key={o.key} className="card option-edit">
                <div className="option-edit-row">
                  <input
                    aria-label={`Option ${i + 1} name`}
                    placeholder="Insulated subfloor"
                    maxLength={120}
                    value={o.title}
                    onChange={(e) => updateOption(o.key, { title: e.target.value })}
                  />
                  <div className="money-input narrow">
                    <span aria-hidden="true">$</span>
                    <input
                      aria-label={`Option ${i + 1} price`}
                      inputMode="decimal"
                      value={o.price}
                      onChange={(e) => updateOption(o.key, { price: e.target.value })}
                    />
                  </div>
                </div>
                <input
                  aria-label={`Option ${i + 1} details`}
                  placeholder="Warmer floor, about 1 in. higher"
                  maxLength={300}
                  value={o.detail}
                  onChange={(e) => updateOption(o.key, { detail: e.target.value })}
                />
                <div className="option-edit-foot">
                  <label className="check-row small">
                    <input
                      type="checkbox"
                      checked={o.recommended}
                      onChange={(e) => updateOption(o.key, { recommended: e.target.checked })}
                    />
                    <span>Ticked to start</span>
                  </label>
                  <button
                    type="button"
                    className="btn small plain danger"
                    onClick={() => setOptions((current) => current.filter((x) => x.key !== o.key))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={() => setOptions((c) => [...c, blankOption()])}>
              Add an option
            </button>
          </div>
        </fieldset>

        <fieldset className="field chips-field">
          <legend>Deposit to book</legend>
          <div className="chips">
            {DEPOSITS.map((d) => (
              <button
                key={d.rate}
                type="button"
                className={deposit === d.rate ? 'chip selected' : 'chip'}
                aria-pressed={deposit === d.rate}
                onClick={() => setDeposit(d.rate)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {deposit > 0 && (
            <span className="hint">When the client accepts, this goes into the job’s payment schedule.</span>
          )}
        </fieldset>

        <label className="field">
          <span>Good until</span>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>

        <div className="card totals">
          <div className="line">
            <span>Base price</span>
            <span className="money">{formatMoney(baseCents, { alwaysCents: true })}</span>
          </div>
          {recommendedCents !== 0 && (
            <div className="line">
              <span>Ticked options</span>
              <span className="money">{formatMoney(recommendedCents, { alwaysCents: true })}</span>
            </div>
          )}
          <div className="line grand">
            <span>Starting total</span>
            <span className="money">{formatMoney(baseCents + recommendedCents, { alwaysCents: true })}</span>
          </div>
          <p className="muted small">Before HST.</p>
        </div>

        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save draft'}
        </button>
      </form>
    </Page>
  );
}
