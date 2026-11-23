import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, referralLink } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { daysAgo, errorMessage, formatDay } from '../lib/format';
import { checkinMessage, firstName, referralMessage, reviewMessage, reviewReminderMessage, smsHref } from '../lib/sms';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { EmptyIcon } from '../components/EmptyIcon';
import { jobTotals } from '../lib/money';
import { paymentProgress } from '../lib/progress';
import type { Job, Lead } from '../lib/types';

type JobRow = Job & { clients: { name: string; phone: string; referral_token: string } | null };
type OpenJobRow = JobRow & {
  changes: { status: string; price_cents: number }[];
  payment_milestones: { status: string; amount_cents: number }[];
};
type LeadRow = Lead & { referred_by: { name: string } | null };

const MONTH = 30.44;

export function Grow() {
  const { contractor } = useAuth();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [paidUp, setPaidUp] = useState<OpenJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jobsRes, leadsRes] = await Promise.all([
      supabase.from('jobs').select('*, clients(name, phone, referral_token)').eq('status', 'done').order('done_at', { ascending: false }),
      supabase.from('leads').select('*, referred_by:clients(name)').eq('source', 'referral').order('created_at', { ascending: false }),
    ]);
    const err = jobsRes.error ?? leadsRes.error;
    if (err) return setError(errorMessage(err));
    setJobs((jobsRes.data ?? []) as JobRow[]);
    setLeads((leadsRes.data ?? []) as LeadRow[]);
    // Open jobs that are paid in full: close them out so they can be asked for a review.
    const open = await supabase
      .from('jobs')
      .select('*, clients(name, phone, referral_token), changes(status, price_cents), payment_milestones(status, amount_cents)')
      .eq('status', 'active');
    setPaidUp(
      ((open.data ?? []) as OpenJobRow[]).filter(
        (j) =>
          paymentProgress({
            subtotalCents: jobTotals(j.contract_cents, j.tax_rate, j.changes).subtotalCents,
            holdbackRate: Number(j.holdback_rate ?? 0),
            holdbackReleased: Boolean(j.holdback_released_at),
            milestones: j.payment_milestones,
          }).fullyPaid,
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(jobId: string, values: Partial<Job>) {
    const { error } = await supabase.from('jobs').update(values).eq('id', jobId);
    if (error) setError(errorMessage(error));
    await load();
  }

  if (!jobs) {
    return (
      <Page>
        <h1>Grow</h1>
        <ErrorNote message={error} />
        {!error && <Loading />}
      </Page>
    );
  }

  const reviewUrl = contractor?.google_review_url ?? '';
  const business = contractor?.business_name ?? '';
  const closeOut = jobs.filter((j) => !j.review_asked_at && daysAgo(j.done_at) < 90);
  const asked = jobs.filter((j) => j.review_asked_at);
  const checkins = jobs.flatMap((j) => {
    const age = daysAgo(j.done_at) / MONTH;
    const due: { job: JobRow; months: 6 | 12 }[] = [];
    if (age >= 12 && !j.checkin_12m_at) due.push({ job: j, months: 12 });
    else if (age >= 6 && !j.checkin_6m_at) due.push({ job: j, months: 6 });
    return due;
  });

  return (
    <Page>
      <h1>Grow</h1>
      <ErrorNote message={error} />

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-number">{asked.length}</span>
          <span className="muted small">Reviews asked</span>
        </div>
        <div className="card stat">
          <span className="stat-number">{leads.length}</span>
          <span className="muted small">Referral leads</span>
        </div>
        <div className="card stat">
          <span className="stat-number">{checkins.length}</span>
          <span className="muted small">Check-ins due</span>
        </div>
      </div>

      {!reviewUrl && (
        <Link to="/settings" className="card banner-card">
          <EmptyIcon name="star" />
          <span className="banner-text">
            <strong>Connect your Google review link</strong>
            <span className="small">It’s added to every review request for you.</span>
          </span>
          <span className="row-chevron" aria-hidden="true" />
        </Link>
      )}

      <section className="stack">
        <h2>Ready to close out</h2>
        {closeOut.length === 0 && paidUp.length === 0 && (
          <p className="muted small">When you mark a job done, it shows up here to ask for a review and a referral.</p>
        )}
        {paidUp.map((j) => (
          <article key={j.id} className="card pad-card close-card">
            <span className="row-main">
              <strong>{j.title}</strong>
              <span className="small">
                {j.clients?.name} · <span className="approved-text">Paid in full</span>
              </span>
            </span>
            <button
              type="button"
              className="btn small"
              onClick={() => void mark(j.id, { status: 'done' })}
            >
              Mark done
            </button>
          </article>
        ))}
        {closeOut.map((j) => {
          const client = j.clients;
          if (!client) return null;
          return (
            <article key={j.id} className="card pad-card stack-tight">
              <div className="item-meta-row">
                <strong>
                  {j.title} · {client.name}
                </strong>
                <span className="muted small">Done {formatDay(j.done_at)}</span>
              </div>
              <div className="action-grid">
                {reviewUrl ? (
                  <a
                    href={smsHref(client.phone, reviewMessage({ clientName: client.name, businessName: business, reviewUrl }))}
                    className="btn small dark"
                    onClick={() => void mark(j.id, { review_asked_at: new Date().toISOString() })}
                  >
                    Ask for a review
                  </a>
                ) : (
                  <Link to="/settings" className="btn small outline">
                    Add review link
                  </Link>
                )}
                <a
                  href={smsHref(
                    client.phone,
                    referralMessage({ clientName: client.name, businessName: business, link: referralLink(client.referral_token) }),
                  )}
                  className="btn small outline"
                >
                  Send referral link
                </a>
              </div>
              <Link to={`/jobs/${j.id}/post`} className="btn small plain">
                Before-and-after post{j.photo_consent_at ? '' : ' (ask first)'}
              </Link>
            </article>
          );
        })}
      </section>

      {asked.length > 0 && (
        <section className="stack">
          <h2>Reviews</h2>
          <ul className="card rows">
            {asked.map((j) => {
              const client = j.clients;
              const lastNudge = j.review_reminded_at ?? j.review_asked_at;
              const canRemind = !j.review_received_at && daysAgo(lastNudge) >= 5 && reviewUrl && client;
              return (
                <li key={j.id} className="proposal-row">
                  <span className={`dot ${j.review_received_at ? 'accepted' : 'draft'}`} aria-hidden="true" />
                  <span className="row-main">
                    <strong>
                      {client?.name} · {j.title}
                    </strong>
                    <span className="muted small">
                      {j.review_received_at
                        ? `Left a review ${formatDay(j.review_received_at)}`
                        : `Asked ${formatDay(j.review_asked_at)}${j.review_reminded_at ? ' · reminded' : ''} · no review yet`}
                    </span>
                  </span>
                  {canRemind && (
                    <a
                      href={smsHref(client.phone, reviewReminderMessage({ clientName: client.name, reviewUrl }))}
                      className="btn small outline"
                      onClick={() => void mark(j.id, { review_reminded_at: new Date().toISOString() })}
                    >
                      Remind
                    </a>
                  )}
                  {!j.review_received_at && (
                    <button
                      type="button"
                      className="btn small plain"
                      onClick={() => void mark(j.id, { review_received_at: new Date().toISOString() })}
                    >
                      Got it
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted small">Google doesn’t tell apps who reviewed, so tap Got it when you see theirs.</p>
        </section>
      )}

      <section className="stack">
        <h2>Referrals</h2>
        {leads.length === 0 ? (
          <div className="card empty-card">
            <EmptyIcon name="people" />
            <strong>No referral leads yet</strong>
            <span className="muted small">
              When a friend uses a client’s referral link, they show up here and on Today as a new lead.
            </span>
            {jobs[0]?.clients?.referral_token && (
              <a href={referralLink(jobs[0].clients.referral_token)} target="_blank" rel="noreferrer" className="btn small outline">
                Preview a referral link
              </a>
            )}
          </div>
        ) : (
          <ul className="card rows">
            {leads.map((l) => (
              <li key={l.id}>
                <Link to="/" className="row-link">
                  <span className={`dot ${l.status === 'new' ? 'sent' : 'draft'}`} aria-hidden="true" />
                  <span className="row-main">
                    <strong>
                      {l.name}
                      {l.project ? ` · ${l.project.slice(0, 40)}` : ''}
                    </strong>
                    <span className="accent-text small">
                      Came from {firstName(l.referred_by?.name ?? '') || 'a client'}’s link · {STATUS[l.status]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {checkins.length > 0 && (
        <section className="stack">
          <h2>Check-ins due</h2>
          <ul className="card rows">
            {checkins.map(({ job: j, months }) =>
              j.clients ? (
                <li key={`${j.id}-${months}`} className="proposal-row">
                  <span className="row-main">
                    <strong>
                      {j.clients.name} · {j.title}
                    </strong>
                    <span className="muted small">{months === 6 ? 'Six-month' : 'One-year'} check-in</span>
                  </span>
                  <a
                    href={smsHref(j.clients.phone, checkinMessage({ clientName: j.clients.name, jobTitle: j.title, months }))}
                    className="btn small outline"
                    onClick={() =>
                      void mark(j.id, months === 6 ? { checkin_6m_at: new Date().toISOString() } : { checkin_12m_at: new Date().toISOString() })
                    }
                  >
                    Text
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
    </Page>
  );
}

const STATUS: Record<Lead['status'], string> = {
  new: 'new',
  contacted: 'contacted',
  quoted: 'quoted',
  closed: 'closed',
};
