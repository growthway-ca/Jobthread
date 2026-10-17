import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatWhen } from '../lib/format';
import { formatMoney, holdbackCents, taxCents } from '../lib/money';
import { firstName, scheduleClause, smsHref } from '../lib/sms';
import { Header, Loading } from '../components/Layout';
import type { ClientProject as Project } from '../lib/types';

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; project: Project };

/** Public page a homeowner keeps for their job (/j/:token). Read-only, no sign-in. */
export function ClientProject() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const load = () =>
      supabase.rpc('get_job_by_share_token', { p_token: token }).then(({ data, error }) => {
        if (error) return setState({ kind: 'error' });
        setState(data ? { kind: 'ready', project: data as Project } : { kind: 'missing' });
      });
    void load();
    // Fresh numbers when they come back to the tab, e.g. after approving a change.
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token]);

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
        {state.kind === 'ready' && <ProjectView project={state.project} />}
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

function ProjectView({ project: p }: { project: Project }) {
  const approved = p.changes.filter((c) => c.status === 'approved');
  const waiting = p.changes.filter((c) => c.status === 'sent');
  const changesCents = approved.reduce((t, c) => t + c.price_cents, 0);
  const subtotal = p.contract_cents + changesCents;
  const paid = p.payments.filter((m) => m.status === 'paid').reduce((t, m) => t + m.amount_cents, 0);
  const left = subtotal - paid;
  const nextIndex = p.payments.findIndex((m) => m.status !== 'paid');
  const holdback = Number(p.holdback_rate) > 0 ? holdbackCents(subtotal, p.holdback_rate) : 0;
  const question = smsHref(p.contractor_phone, `Hi, a question about my ${p.title}: `);

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
