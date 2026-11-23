import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, publicBaseUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage, formatWhen } from '../lib/format';
import { formatMoney, taxCents, taxLabel } from '../lib/money';
import { firstName, quoteMessage, smsHref } from '../lib/sms';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';
import { SignatureView } from '../components/SignaturePad';
import { QUOTE_PHOTO_BUCKET, quotePhotoUrl } from '../lib/photos';
import type { Client, Quote, QuoteEvent, QuoteOption, QuotePhoto } from '../lib/types';

type QuoteFull = Quote & {
  clients: Client;
  quote_options: QuoteOption[];
  quote_views: { viewed_at: string }[];
  quote_photos: QuotePhoto[];
  quote_events: QuoteEvent[];
};

const KIND_ORDER = { package: 0, choice: 1, addon: 2 } as const;

const STATUS_TEXT: Record<Quote['status'], string> = {
  draft: 'Draft',
  sent: 'With client',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
  lost: 'Lost',
};

export function proposalLink(token: string): string {
  return `${publicBaseUrl()}/p/${token}`;
}

export function QuoteDetail() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { contractor } = useAuth();
  const [quote, setQuote] = useState<QuoteFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, clients(*), quote_options(*), quote_views(viewed_at), quote_photos(*), quote_events(*)')
      .eq('id', quoteId)
      .maybeSingle();
    if (error || !data) return setError(error ? errorMessage(error) : 'We couldn’t find that quote.');
    const q = data as QuoteFull;
    // Packages, then choices, then add-ons.
    q.quote_options.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position);
    q.quote_photos.sort((a, b) => a.position - b.position);
    setQuote(q);
  }, [quoteId]);

  useEffect(() => {
    void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (!quote) {
    return (
      <Page>
        <ErrorNote message={error} />
        {!error && <Loading />}
      </Page>
    );
  }

  const q = quote;
  const message = quoteMessage({
    clientName: q.clients.name,
    businessName: contractor?.business_name ?? '',
    title: q.title,
    baseCents: q.base_cents,
    hasOptions: q.quote_options.length > 0,
    link: proposalLink(q.approval_token),
  });
  const counts = (o: QuoteOption) => (q.status === 'accepted' ? o.selected : o.recommended);
  const subtotal = q.base_cents + q.quote_options.filter(counts).reduce((t, o) => t + o.price_cents, 0);
  const tax = taxCents(subtotal, q.tax_rate);

  async function setStatus(status: Quote['status'], confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('quotes').update({ status }).eq('id', q.id);
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    await load();
    return true;
  }

  async function send() {
    if (await setStatus('sent')) window.location.href = smsHref(q.clients.phone, message);
  }

  async function removeDraft() {
    if (!window.confirm('Delete this draft?')) return;
    const { error } = await supabase.from('quotes').delete().eq('id', q.id);
    if (error) return setError(errorMessage(error));
    navigate('/quotes', { replace: true });
  }

  /** Copies the quote into a new draft; a quote still with the client is withdrawn. */
  async function revise() {
    if (q.status === 'sent' && !window.confirm('Make a revision? The current link stops working once you do.')) return;
    setBusy(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const { error } = await supabase.from('quotes').insert({
        id,
        client_id: q.client_id,
        title: q.title,
        address: q.address,
        scope: q.scope,
        base_cents: q.base_cents,
        tax_rate: q.tax_rate,
        deposit_rate: q.deposit_rate,
        valid_until: q.valid_until,
        status: 'draft',
      });
      if (error) throw error;
      if (q.quote_options.length > 0) {
        const { error: optError } = await supabase.from('quote_options').insert(
          q.quote_options.map((o) => ({
            quote_id: id,
            position: o.position,
            title: o.title,
            detail: o.detail,
            price_cents: o.price_cents,
            recommended: o.recommended,
            kind: o.kind,
            group_name: o.group_name ?? null,
            swatch: o.swatch ?? null,
          })),
        );
        if (optError) throw optError;
      }
      // Photos are stored under the quote's id, so each one is copied across.
      for (const p of q.quote_photos) {
        const path = `${id}/${crypto.randomUUID()}.jpg`;
        const { error: copyError } = await supabase.storage.from(QUOTE_PHOTO_BUCKET).copy(p.storage_path, path);
        if (copyError) throw copyError;
        const { error: photoError } = await supabase.from('quote_photos').insert({
          quote_id: id,
          storage_path: path,
          label: p.label,
          position: p.position,
          width: p.width,
          height: p.height,
        });
        if (photoError) throw photoError;
      }
      if (q.status === 'sent') {
        const { error: wError } = await supabase.from('quotes').update({ status: 'withdrawn' }).eq('id', q.id);
        if (wError) throw wError;
      }
      navigate(`/quotes/${id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const scopeLines = (q.scope ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <Page>
      <Link to="/quotes" className="back">
        Back to quotes
      </Link>
      <div className="job-head">
        <span className={`pill status-${q.status}`}>{STATUS_TEXT[q.status]}</span>
        <h1>{q.title}</h1>
        <p className="muted">
          Quote #{q.number} · {q.clients.name}
          {q.address ? ` · ${q.address}` : ''}
        </p>
      </div>

      {q.status === 'accepted' && (
        <div className="card approved-banner" role="status">
          <h2>
            {q.accepted_signature ? 'Signed' : 'Accepted'} by {q.accepted_name}
          </h2>
          <p>{formatWhen(q.accepted_at)}</p>
          {q.accepted_signature && <SignatureView path={q.accepted_signature} label={`Signature of ${q.accepted_name}`} />}
          {q.job_id && (
            <Link to={`/jobs/${q.job_id}`} className="btn primary">
              Open the job
            </Link>
          )}
        </div>
      )}

      {q.quote_photos.length > 0 && (
        <div className="photo-strip">
          {q.quote_photos.map((p) => (
            <figure key={p.id} className="photo strip-photo">
              <img src={quotePhotoUrl(p.storage_path)} alt={p.label ?? ''} />
              {p.label && <figcaption>{p.label}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {(q.status === 'sent' || q.status === 'accepted') && <ActivityTimeline quote={q} />}

      {scopeLines.length > 0 && (
        <ul className="checklist">
          {scopeLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      <div className="card totals">
        <div className="line">
          <span>Base price</span>
          <span className="money">{formatMoney(q.base_cents, { alwaysCents: true })}</span>
        </div>
        {q.quote_options.map((o) => (
          <div className={`line ${counts(o) ? '' : 'unpicked'}`} key={o.id}>
            <span>
              {o.title}
              <span className="muted small block">
                {o.kind === 'package' ? 'Package · ' : o.kind === 'choice' ? `${o.group_name} · ` : ''}
                {q.status === 'accepted'
                  ? o.selected
                    ? 'Picked'
                    : 'Not picked'
                  : o.recommended
                    ? o.kind !== 'addon'
                      ? 'Picked to start'
                      : 'Ticked to start'
                    : 'Optional'}
                {o.detail ? ` · ${o.detail}` : ''}
              </span>
            </span>
            <span className="money">+{formatMoney(o.price_cents, { alwaysCents: true })}</span>
          </div>
        ))}
        <div className="line rule">
          <span>Subtotal</span>
          <span className="money">{formatMoney(subtotal, { alwaysCents: true })}</span>
        </div>
        <div className="line">
          <span>{taxLabel(q.tax_rate)}</span>
          <span className="money">{formatMoney(tax, { alwaysCents: true })}</span>
        </div>
        <div className="line grand">
          <span>{q.status === 'accepted' ? 'Total' : 'Starting total'}</span>
          <span className="money">{formatMoney(subtotal + tax, { alwaysCents: true })}</span>
        </div>
        <p className="muted small">
          {Number(q.deposit_rate) > 0 ? `${Math.round(Number(q.deposit_rate) * 100)}% deposit to book. ` : ''}
          {q.valid_until
            ? `Good until ${new Date(q.valid_until + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}.`
            : ''}
        </p>
      </div>

      <ErrorNote message={error} />

      {q.status === 'draft' && (
        <div className="stack">
          <div>
            <p className="preview-label">{firstName(q.clients.name) || q.clients.name} will get this text:</p>
            <div className="card sms-preview">{message.replace(proposalLink(q.approval_token), `${publicBaseUrl()}/p/…`)}</div>
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void send()}>
            Send to {firstName(q.clients.name) || 'client'}
          </button>
          <p className="muted small center">Once sent, the quote is locked. To change it, make a revision.</p>
          <Link to={`/quotes/${q.id}/edit`} className="btn secondary">
            Edit draft
          </Link>
          <button type="button" className="btn plain danger" onClick={() => void removeDraft()}>
            Delete draft
          </button>
        </div>
      )}

      {q.status === 'sent' && (
        <div className="stack">
          <p className="waiting-line">
            Waiting on {firstName(q.clients.name)} · sent {formatWhen(q.sent_at)}
          </p>
          <p className="muted small">
            {q.quote_views.length === 0
              ? 'Not opened yet.'
              : `Opened ${q.quote_views.length === 1 ? 'once' : `${q.quote_views.length} times`}, last ${formatWhen(
                  [...q.quote_views].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))[0].viewed_at,
                )}.`}
          </p>
          <SendActions phone={q.clients.phone} message={message} label="Resend" />
          <a href={proposalLink(q.approval_token)} target="_blank" rel="noreferrer" className="btn plain">
            See what {firstName(q.clients.name) || 'the client'} sees
          </a>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void revise()}>
            Make a revision
          </button>
          <div className="row-actions center-row">
            <button
              type="button"
              className="btn small plain"
              disabled={busy}
              onClick={() => void setStatus('lost', 'Mark this quote as lost? The link stops working.')}
            >
              Mark lost
            </button>
            <button
              type="button"
              className="btn small plain danger"
              disabled={busy}
              onClick={() => void setStatus('withdrawn', 'Withdraw this quote? The link stops working.')}
            >
              Withdraw
            </button>
          </div>
        </div>
      )}

      {(q.status === 'lost' || q.status === 'withdrawn') && (
        <button type="button" className="btn secondary" disabled={busy} onClick={() => void revise()}>
          Start a new version
        </button>
      )}
    </Page>
  );
}

/** "What Sarah did": opens, taps and signing, newest first. */
function ActivityTimeline({ quote: q }: { quote: QuoteFull }) {
  const name = firstName(q.clients.name) || q.clients.name;
  const items: { at: string; text: string; detail?: string; tone?: 'signed' | 'picked' | 'removed' }[] = [];
  if (q.sent_at) items.push({ at: q.sent_at, text: 'You sent the quote' });
  for (const v of q.quote_views) items.push({ at: v.viewed_at, text: `${name} opened it` });
  for (const e of q.quote_events) {
    items.push({
      at: e.created_at,
      text: e.kind === 'picked' ? `Picked ${e.title}` : `Took off ${e.title}`,
      detail: e.total_cents === null ? undefined : `Price now ${formatMoney(e.total_cents)} + HST`,
      tone: e.kind,
    });
  }
  if (q.status === 'accepted' && q.accepted_at) {
    items.push({ at: q.accepted_at, text: `${name} signed`, tone: 'signed' });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  if (items.length <= 1) return null;
  return (
    <section className="stack-tight">
      <h2>What {name} did</h2>
      <ol className="card activity">
        {items.map((item, i) => (
          <li key={i} className={item.tone ?? ''}>
            <span className="activity-dot" aria-hidden="true" />
            <span className="activity-main">
              <strong>{item.text}</strong>
              {item.detail && <span className="muted small">{item.detail}</span>}
            </span>
            <span className="muted small activity-when">{formatWhen(item.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
