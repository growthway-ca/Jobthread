import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { formatMoney, formatMoneyShort } from '../lib/money';
import { quoteNudgeMessage, smsHref } from '../lib/sms';
import { proposalLink } from './QuoteDetail';
import { ErrorNote, Loading, Page } from '../components/Layout';
import type { Quote } from '../lib/types';

type QuoteRow = Quote & {
  clients: { name: string; phone: string } | null;
  quote_options: { price_cents: number; recommended: boolean; selected: boolean | null }[];
  quote_views: { viewed_at: string }[];
};

/** Base plus the options that count: picked ones once accepted, ticked ones before. */
export function quoteTotal(q: QuoteRow): number {
  const counts = (o: QuoteRow['quote_options'][number]) => (q.status === 'accepted' ? o.selected : o.recommended);
  return q.base_cents + q.quote_options.filter(counts).reduce((t, o) => t + o.price_cents, 0);
}

/** "Oct 17": no minutes on a list. */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');

/** The status badge for a quote: what happened, and when. */
function statusBadge(q: QuoteRow): { text: string; tone: '' | 'waiting' | 'info' | 'approved' } {
  switch (q.status) {
    case 'draft':
      return { text: `Draft · started ${day(q.created_at)}`, tone: '' };
    case 'sent': {
      const views = q.quote_views.length;
      if (views === 0) return { text: `Unopened · sent ${day(q.sent_at)}`, tone: 'waiting' };
      const last = [...q.quote_views].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))[0].viewed_at;
      return { text: `Opened ${views === 1 ? 'once' : `${views} times`} · last ${day(last)}`, tone: 'info' };
    }
    case 'accepted':
      return { text: `${q.accepted_signature ? 'Signed' : 'Accepted'} ${day(q.accepted_at)}`, tone: 'approved' };
    case 'lost':
      return { text: 'Lost', tone: '' };
    case 'withdrawn':
      return { text: 'Withdrawn', tone: '' };
  }
}

export function Quotes() {
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('quotes')
      .select('*, clients(name, phone), quote_options(price_cents, recommended, selected), quote_views(viewed_at)')
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
  const wonThisMonth = won.filter((q) => (q.accepted_at ?? '').startsWith(month));
  const sum = (list: QuoteRow[]) => list.reduce((t, q) => t + quoteTotal(q), 0);

  return (
    <Page>
      <div className="page-title">
        <h1>Quotes</h1>
        <Link to="/quotes/new" className="btn small title-action">
          + New quote
        </Link>
      </div>
      <ErrorNote message={error} />
      {!quotes && !error && <Loading />}
      {quotes && (
        <div className="stat-row">
          <div className="card stat">
            <span className="stat-number">{drafts.length}</span>
            <span className="muted small">Drafts</span>
          </div>
          <div className={`card stat ${out.length ? 'stat-info' : ''}`}>
            <span className="stat-number">{out.length}</span>
            <span className="small">With clients</span>
            {out.length > 0 && <span className="stat-money">{formatMoneyShort(sum(out))}</span>}
          </div>
          <div className={`card stat ${wonThisMonth.length ? 'stat-won' : ''}`}>
            <span className="stat-number">{wonThisMonth.length}</span>
            <span className="small">Won this month</span>
            {wonThisMonth.length > 0 && <span className="stat-money">{formatMoneyShort(sum(wonThisMonth))}</span>}
          </div>
        </div>
      )}
      {quotes && quotes.length === 0 && (
        <p className="muted center pad">No quotes yet. When a client signs one, it becomes a job.</p>
      )}
      <QuoteSection title="With clients" quotes={out} />
      <QuoteSection title="Drafts" quotes={drafts} />
      <QuoteSection title="Won" quotes={won} />
      <QuoteSection title="Closed" quotes={closed} />
    </Page>
  );
}

function QuoteSection({ title, quotes }: { title: string; quotes: QuoteRow[] }) {
  if (quotes.length === 0) return null;
  return (
    <section className="stack">
      <h2>{title}</h2>
      <ul className="list">
        {quotes.map((q) => {
          const badge = statusBadge(q);
          const followUp = q.status === 'sent' && q.quote_views.length === 0 && q.clients?.phone;
          return (
            <li key={q.id} className="card quote-card">
              <Link to={`/quotes/${q.id}`} className="quote-card-main">
                <span className="job-card-top">
                  <strong className="job-title">{q.title}</strong>
                  <span className="money">{formatMoney(quoteTotal(q))}</span>
                  <span className="row-chevron" aria-hidden="true" />
                </span>
                <span className="muted">
                  {q.clients?.name} · #{q.number}
                </span>
              </Link>
              <div className="quote-card-foot">
                <span className={`pill ${badge.tone === 'approved' ? 'approved-pill' : badge.tone}`}>{badge.text}</span>
                {followUp && q.clients && (
                  <a
                    className="btn small outline"
                    href={smsHref(
                      q.clients.phone,
                      quoteNudgeMessage({ clientName: q.clients.name, title: q.title, link: proposalLink(q.approval_token) }),
                    )}
                  >
                    Follow up
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
