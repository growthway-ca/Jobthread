import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDateRange, formatWhen, todayIso } from '../lib/format';
import { formatMoney, holdbackCents, taxCents } from '../lib/money';
import { firstName, scheduleClause, smsHref } from '../lib/sms';
import { ErrorNote, Header, Loading } from '../components/Layout';
import type { ClientProject as Project } from '../lib/types';
import { formatTimeRange, shutoffTitle, utilityLabel } from '../lib/shutoffs';
import { groupSelections, selectionDetails, tileLayout } from '../lib/selections';
import type { PublicSelection } from '../lib/types';

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; project: Project };

/** Public page a homeowner keeps for their job (/j/:token). Read-only, no sign-in. */
export function ClientProject() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(
    () =>
      supabase.rpc('get_job_by_share_token', { p_token: token }).then(({ data, error }) => {
        if (error) return setState({ kind: 'error' });
        setState(data ? { kind: 'ready', project: data as Project } : { kind: 'missing' });
      }),
    [token],
  );

  useEffect(() => {
    void load();
    // Fresh numbers when they come back to the tab, e.g. after approving a change.
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow">
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'missing' && (
          <Message title="This link doesn’t work">
            It may have been cut off, or your contractor sent a newer one. Ask them to send it again.
          </Message>
        )}
        {state.kind === 'error' && (
          <Message title="We couldn’t load this">Check your connection and refresh the page.</Message>
        )}
        {state.kind === 'ready' && <ProjectView project={state.project} token={token} reload={load} />}
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

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';

function ProjectView({ project: p, token, reload }: { project: Project; token: string; reload: () => PromiseLike<unknown> }) {
  const approved = p.changes.filter((c) => c.status === 'approved');
  const waiting = p.changes.filter((c) => c.status === 'sent');
  const changesCents = approved.reduce((t, c) => t + c.price_cents, 0);
  const subtotal = p.contract_cents + changesCents;
  const paid = p.payments.filter((m) => m.status === 'paid').reduce((t, m) => t + m.amount_cents, 0);
  const left = subtotal - paid;
  const nextIndex = p.payments.findIndex((m) => m.status !== 'paid');
  const holdback = Number(p.holdback_rate) > 0 ? holdbackCents(subtotal, p.holdback_rate) : 0;
  const question = smsHref(p.contractor_phone, `Hi, a question about my ${p.title}: `);
  const selections = p.selections ?? [];
  const toConfirm = selections.some((s) => !s.confirmed_at);
  const selectionsSection = selections.length > 0 && (
    <SelectionsSection selections={selections} token={token} business={p.business_name} phone={p.contractor_phone} reload={reload} />
  );

  return (
    <div className="stack">
      <div className="proposal-head">
        <p className="from">{p.business_name} · shared with you</p>
        <h1>
          Your {p.title}
          {p.address ? ` at ${p.address}` : ''}
        </h1>
        {p.status === 'done' && <span className="pill approved-pill">Finished</span>}
      </div>

      <div className="card dark-total">
        <span className="small">Left to pay</span>
        <span className="hero-number">{formatMoney(left)}</span>
        <p className="small">
          Contract {formatMoney(p.contract_cents)}
          {approved.length > 0 ? ` + changes ${formatMoney(changesCents)}` : ''}
          {paid > 0 ? ` − paid ${formatMoney(paid)}` : ''}. Before HST.
        </p>
      </div>

      {waiting.length > 0 && (
        <section className="stack">
          <h2>Waiting on you</h2>
          {waiting.map((c) => (
            <Link key={c.number} to={`/a/${c.approval_token}`} className="card pad-card waiting-card">
              <span className="muted small">Change #{c.number}</span>
              <strong>{c.description}</strong>
              <span>
                {formatMoney(c.price_cents)} + HST
                {scheduleClause(c.time_added) ? ` · ${scheduleClause(c.time_added)}` : ''}
              </span>
              <span className="btn small">Review and approve</span>
            </Link>
          ))}
        </section>
      )}

      {toConfirm && selectionsSection}

      {p.schedule.length > 0 && <ScheduleSection schedule={p.schedule} />}

      {!toConfirm && selectionsSection}

      {p.payments.length > 0 && (
        <section className="stack">
          <h2>Payments</h2>
          <ol className="timeline">
            {p.payments.map((m, i) => {
              const tax = taxCents(m.amount_cents, p.tax_rate);
              const state = m.status === 'paid' ? 'paid' : i === nextIndex ? 'next' : 'upcoming';
              return (
                <li key={i} className={`timeline-item ${state}`}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-main">
                    <strong>{m.title}</strong>
                    <span className="muted small">
                      {m.status === 'paid'
                        ? `Paid ${shortDate(m.paid_at)}`
                        : m.status === 'requested'
                          ? `Due now · requested ${shortDate(m.requested_at)}`
                          : state === 'next'
                            ? `Next${m.due_note ? ` · ${m.due_note}` : ''}`
                            : (m.due_note ?? 'Upcoming')}
                    </span>
                  </div>
                  <span className="timeline-amount">
                    <span className="money">{formatMoney(m.amount_cents + tax, { alwaysCents: true })}</span>
                    <span className="muted small">incl. HST</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {holdback > 0 && (
            <p className="muted small">
              {Math.round(Number(p.holdback_rate) * 100)}% holdback ({formatMoney(holdback)} before HST) is kept back
              until the lien period ends.
            </p>
          )}
          {p.etransfer_email && (
            <p className="small">
              Pay by e-Transfer to <strong>{p.etransfer_email}</strong>.
            </p>
          )}
        </section>
      )}

      {approved.length > 0 && (
        <section className="stack">
          <div className="title-row">
            <h2>Changes</h2>
            <span className="muted small">+{formatMoney(changesCents)} approved</span>
          </div>
          <ul className="card rows">
            {approved.map((c) => (
              <li key={c.number} className="change-row">
                <span className="change-num">{String(c.number).padStart(2, '0')}</span>
                <span className="row-main">
                  <strong>{c.description}</strong>
                  <span className="muted small">
                    Approved {shortDate(c.approved_at)}
                    {c.approved_name ? ` by ${firstName(c.approved_name) || c.approved_name}` : ''}
                  </span>
                </span>
                <span className="money">+{formatMoney(c.price_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.updates.length > 0 && (
        <section className="stack">
          <h2>Updates</h2>
          <ol className="thread">
            {p.updates.map((u, i) => (
              <li key={i}>
                <article className="card item log">
                  <p className="item-meta">{formatWhen(u.created_at)}</p>
                  <p className="item-body">{u.body}</p>
                </article>
              </li>
            ))}
          </ol>
        </section>
      )}

      <a href={question} className="btn secondary">
        Text {p.business_name}
      </a>
      <p className="muted small center">
        This page updates as the job goes. Keep the link to check in anytime.
      </p>
    </div>
  );
}

function SelectionsSection({
  selections,
  token,
  business,
  phone,
  reload,
}: {
  selections: PublicSelection[];
  token: string;
  business: string;
  phone: string;
  reload: () => PromiseLike<unknown>;
}) {
  const open = selections.filter((s) => !s.confirmed_at);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('confirm_selections', {
      p_token: token,
      p_name: name,
      p_ids: open.map((s) => s.id),
    });
    setBusy(false);
    if (error) {
      if (error.message === 'name_required') return setError('Type your name first.');
      return setError('That didn’t work. Check your signal and try again.');
    }
    await reload();
  }

  return (
    <section className="stack">
      <h2>Your selections</h2>
      {groupSelections(selections).map((g) => (
        <div key={g.id} className="stack-tight">
          <p className="label-sm">{g.plural}</p>
          <ul className="card rows">
            {g.items.map((s) => {
              const details = selectionDetails(s);
              return (
                <li key={s.id} className="row-link static">
                  <span className="row-main">
                    <strong>{s.name}</strong>
                    {details && <span className="selection-details">{details}</span>}
                    {tileLayout(s) && <span className="small">{tileLayout(s)}</span>}
                    {s.location && <span className="small">Where: {s.location}</span>}
                    {s.note && <span className="muted small">{s.note}</span>}
                    <span className={s.confirmed_at ? 'confirmed-text small' : 'waiting-text small'}>
                      {s.confirmed_at
                        ? `Confirmed by ${firstName(s.confirmed_name ?? '') || s.confirmed_name} · ${shortDate(s.confirmed_at)}`
                        : 'Waiting for you to confirm'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {open.length > 0 && (
        <form onSubmit={confirm} className="card pad-card stack-tight waiting-card">
          <strong>Is this what you picked?</strong>
          <span className="muted small">
            Check the names, codes and rooms. If anything’s off, text {business} instead and they’ll fix it.
          </span>
          <label className="field">
            <span>Type your name</span>
            <input autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <ErrorNote message={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Confirming…' : open.length === 1 ? 'Confirm this selection' : `Confirm these ${open.length} selections`}
          </button>
          <a href={smsHref(phone, 'Hi, about my selections: ')} className="btn plain">
            Something’s not right
          </a>
        </form>
      )}
    </section>
  );
}

function ScheduleSection({ schedule }: { schedule: Project['schedule'] }) {
  const today = todayIso();
  const upcoming = schedule.filter((s) => (s.ends_on ?? s.starts_on) >= today);
  if (upcoming.length === 0) return null;
  return (
    <section className="stack">
      <h2>What’s happening when</h2>
      <ul className="card rows">
        {upcoming.map((s, i) => {
          const onNow = s.starts_on <= today && (s.ends_on ?? s.starts_on) >= today;
          return (
            <li key={i} className="row-link static">
              <span className={`date-chip ${onNow ? 'now' : ''}`}>{onNow ? 'Now' : formatDateRange(s.starts_on, s.ends_on)}</span>
              <span className="row-main">
                <strong>
                  {s.utility ? (
                    <>
                      <span className="pill shutoff-pill">{utilityLabel(s.utility)} off</span> {shutoffTitle(s.title, s.utility)}
                    </>
                  ) : (
                    s.title
                  )}
                </strong>
                {s.utility && (s.from_time || s.to_time) && (
                  <span className="small">{formatTimeRange(s.from_time ?? null, s.to_time ?? null)}</span>
                )}
                {(s.trade || s.note || onNow) && (
                  <span className="muted small">
                    {onNow ? formatDateRange(s.starts_on, s.ends_on) : ''}
                    {onNow && (s.trade || s.note) ? ' · ' : ''}
                    {[s.trade, s.note].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
