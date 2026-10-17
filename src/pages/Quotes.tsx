import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage, formatWhen } from '../lib/format';
import { formatMoney } from '../lib/money';
import { ErrorNote, Loading, Page } from '../components/Layout';
import type { Quote } from '../lib/types';

type QuoteRow = Quote & {
  clients: { name: string } | null;
  quote_options: { price_cents: number; recommended: boolean; selected: boolean | null }[];
  quote_views: { viewed_at: string }[];
};

/** Base plus the options that count: picked ones once accepted, ticked ones before. */
export function quoteTotal(q: QuoteRow): number {
  const counts = (o: QuoteRow['quote_options'][number]) => (q.status === 'accepted' ? o.selected : o.recommended);
  return q.base_cents + q.quote_options.filter(counts).reduce((t, o) => t + o.price_cents, 0);
}

export function Quotes() {
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('quotes')
      .select('*, clients(name), quote_options(price_cents, recommended, selected), quote_views(viewed_at)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        else setQuotes((data as QuoteRow[]) ?? []);
      });
  }, []);

  const drafts = quotes?.filter((q) => q.status === 'draft') ?? [];
  const out = quotes?.filter((q) => q.status === 'sent') ?? [];
  const won = quotes?.filter((q) => q.status === 'accepted') ?? [];
  const closed = quotes?.filter((q) => q.status === 'lost' || q.status === 'withdrawn') ?? [];
  const month = new Date().toISOString().slice(0, 7);
  const wonThisMonth = won.filter((q) => (q.accepted_at ?? '').startsWith(month)).length;

  return (
    <Page>
      <h1>Quotes</h1>
      <Link to="/quotes/new" className="btn primary">
        New quote
      </Link>
      <ErrorNote message={error} />
      {!quotes && !error && <Loading />}
      {quotes && (
        <div className="stat-row">
          <div className="card stat">
            <span className="stat-number">{drafts.length}</span>
            <span className="muted small">Drafts</span>
          </div>
          <div className="card stat">
            <span className="stat-number">{out.length}</span>
            <span className="muted small">With clients</span>
          </div>
          <div className="card stat">
            <span className="stat-number">{wonThisMonth}</span>
            <span className="muted small">Won this month</span>
          </div>
        </div>
      )}
      {quotes && quotes.length === 0 && (
        <p className="muted center pad">No quotes yet. When a client accepts one, it becomes a job.</p>
      )}
      <QuoteSection title="Drafts" quotes={drafts} detail={(q) => `Started ${formatWhen(q.created_at)}`} />
      <QuoteSection
        title="With clients"
        quotes={out}
        detail={(q) =>
          q.quote_views.length > 0
            ? `Opened ${q.quote_views.length === 1 ? 'once' : `${q.quote_views.length} times`} · sent ${formatWhen(q.sent_at)}`
            : `Not opened yet · sent ${formatWhen(q.sent_at)}`
        }
      />
      <QuoteSection title="Won" quotes={won} detail={(q) => `Accepted by ${q.accepted_name}, ${formatWhen(q.accepted_at)}`} />
      <QuoteSection title="Closed" quotes={closed} detail={(q) => (q.status === 'lost' ? 'Lost' : 'Withdrawn')} />
    </Page>
  );
}

function QuoteSection({
  title,
  quotes,
  detail,
}: {
  title: string;
  quotes: QuoteRow[];
  detail: (q: QuoteRow) => string;
}) {
  if (quotes.length === 0) return null;
  return (
    <section className="stack">
      <h2>{title}</h2>
      <ul className="card rows">
        {quotes.map((q) => (
          <li key={q.id}>
            <Link to={`/quotes/${q.id}`} className="row-link">
              <span className={`dot ${q.status}`} aria-hidden="true" />
              <span className="row-main">
                <strong>
                  {q.clients?.name} · {q.title}
                </strong>
                <span className="muted small">
                  #{q.number} · {detail(q)}
                </span>
              </span>
              <span className="money">{formatMoney(quoteTotal(q))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
