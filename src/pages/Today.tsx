import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { addDaysIso, daysAgo, errorMessage, formatDateRange, formatWhen, todayIso } from '../lib/format';
import { formatMoney } from '../lib/money';
import { firstName, leadReplyMessage, quoteNudgeMessage, smsHref, smsNumber } from '../lib/sms';
import { proposalLink } from './QuoteDetail';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { InstallTip } from '../components/InstallTip';
import { StartHere } from '../components/StartHere';
import type { Lead, Quote, ScheduleItem } from '../lib/types';

type JobRow = {
  id: string;
  title: string;
  status: 'active' | 'done';
  clients: { name: string; phone: string } | null;
  changes: { status: string; number: number }[];
  payment_milestones: { status: string; title: string; amount_cents: number; position: number }[];
  job_schedule: ScheduleItem[];
};

type QuoteRow = Quote & {
  clients: { name: string; phone: string } | null;
  quote_options: { price_cents: number; recommended: boolean }[];
  quote_views: { viewed_at: string }[];
};

type LeadRow = Lead & { referred_by: { name: string } | null };

interface TodayData {
  jobs: JobRow[];
  quotes: QuoteRow[];
  leads: LeadRow[];
}

const dayLabel = new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

export function Today() {
  const { contractor } = useAuth();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jobsRes, quotesRes, leadsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id, title, status, clients(name, phone), changes(status, number), payment_milestones(status, title, amount_cents, position), job_schedule(*)',
        )
        .eq('status', 'active'),
      supabase
        .from('quotes')
        .select('*, clients(name, phone), quote_options(price_cents, recommended), quote_views(viewed_at)')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false }),
      supabase
        .from('leads')
        .select('*, referred_by:clients(name)')
        .in('status', ['new', 'contacted'])
        .order('created_at', { ascending: false }),
    ]);
    const err = jobsRes.error ?? quotesRes.error ?? leadsRes.error;
    if (err) return setError(errorMessage(err));
    setError(null);
    setData({
      jobs: (jobsRes.data ?? []) as unknown as JobRow[],
      quotes: (quotesRes.data ?? []) as unknown as QuoteRow[],
      leads: (leadsRes.data ?? []) as unknown as LeadRow[],
    });
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const today = todayIso();
  const weekOut = addDaysIso(today, 7);

  return (
    <Page>
      <div className="today-head">
        <p className="muted small">
          {contractor?.business_name} · {dayLabel.format(new Date())}
        </p>
        <h1>Today</h1>
      </div>
      <StartHere />
      <InstallTip />
      <ErrorNote message={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <LeadsSection leads={data.leads} reload={load} />
          <OnSiteSection jobs={data.jobs} today={today} />
          <ProposalsSection quotes={data.quotes} />
          <MoneySection jobs={data.jobs} />
          <ComingUpSection jobs={data.jobs} today={today} weekOut={weekOut} />
        </>
      )}
    </Page>
  );
}

function LeadsSection({ leads, reload }: { leads: LeadRow[]; reload: () => Promise<void> }) {
  const { contractor } = useAuth();
  const [adding, setAdding] = useState(false);

  async function setStatus(lead: LeadRow, status: Lead['status']) {
    await supabase.from('leads').update({ status }).eq('id', lead.id);
    await reload();
  }

  return (
    <section className="stack">
      <div className="title-row">
        <h2>
          New leads {leads.length > 0 && <span className="muted count">{leads.length}</span>}
        </h2>
        {!adding && (
          <button type="button" className="btn small plain" onClick={() => setAdding(true)}>
            Add a lead
          </button>
        )}
      </div>
      {adding && (
        <AddLead
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}
      {leads.length === 0 && !adding && (
        <p className="muted small">
          Leads from your clients’ referral links show up here. Send referral links from the Grow tab.
        </p>
      )}
      {leads.map((lead) => (
        <article key={lead.id} className="card pad-card lead-card">
          <div className="item-meta-row">
            <span className="small strong">
              {lead.source === 'referral'
                ? `Referred by ${lead.referred_by?.name ?? 'a client'}`
                : lead.status === 'contacted'
                  ? 'Contacted'
                  : 'Added by you'}
            </span>
            <span className="muted small">{formatWhen(lead.created_at)}</span>
          </div>
          <strong className="lead-name">
            {lead.name}
            {lead.phone ? ` · ${lead.phone}` : ''}
          </strong>
          {lead.project && <p className="item-body">{lead.project}</p>}
          <div className="action-grid">
            <Link to={`/quotes/new?lead=${lead.id}`} className="btn small dark">
              Start a quote
            </Link>
            {lead.phone ? (
              <a
                href={smsHref(
                  lead.phone,
                  leadReplyMessage({
                    leadName: lead.name,
                    contractorName: contractor?.name ?? '',
                    businessName: contractor?.business_name ?? '',
                    project: lead.project,
                  }),
                )}
                className="btn small outline"
                onClick={() => lead.status === 'new' && void setStatus(lead, 'contacted')}
              >
                Text back
              </a>
            ) : (
              <span />
            )}
          </div>
          <div className="row-actions">
            {lead.phone && (
              <a href={`tel:${smsNumber(lead.phone)}`} className="btn small plain">
                Call
              </a>
            )}
            <button type="button" className="btn small plain" onClick={() => void setStatus(lead, 'closed')}>
              Not a fit
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function AddLead({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('leads')
      .insert({ name: name.trim(), phone: phone.trim() || null, project: project.trim() || null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await onDone();
  }

  return (
    <form onSubmit={save} className="card pad-card stack">
      <label className="field">
        <span>Name</span>
        <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="field">
        <span>What’s the project</span>
        <textarea rows={2} maxLength={1000} placeholder="Main bathroom redo, hoping for spring" value={project} onChange={(e) => setProject(e.target.value)} />
      </label>
      <ErrorNote message={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : 'Add lead'}
      </button>
      <button type="button" className="btn plain" onClick={() => void onDone()}>
        Cancel
      </button>
    </form>
  );
}

function OnSiteSection({ jobs, today }: { jobs: JobRow[]; today: string }) {
  const onSite = jobs
    .map((job) => ({
      job,
      items: job.job_schedule.filter((s) => s.starts_on <= today && (s.ends_on ?? s.starts_on) >= today),
    }))
    .filter((x) => x.items.length > 0);
  // Jobs with nothing on the schedule today but something waiting on the client.
  const waitingOnly = jobs.filter(
    (job) =>
      !onSite.some((x) => x.job.id === job.id) &&
      (job.changes.some((c) => c.status === 'sent') || job.payment_milestones.some((m) => m.status === 'requested')),
  );

  return (
    <section className="stack">
      <h2>On site today</h2>
      {onSite.length === 0 && waitingOnly.length === 0 && (
        <p className="muted small">
          Nothing scheduled today. Add dates from a job’s Schedule tab and they’ll show up here.
        </p>
      )}
      {[...onSite.map((x) => x.job), ...waitingOnly].map((job) => {
        const items = onSite.find((x) => x.job.id === job.id)?.items ?? [];
        const waiting = job.changes.filter((c) => c.status === 'sent');
        const requested = job.payment_milestones.filter((m) => m.status === 'requested');
        const client = firstName(job.clients?.name ?? '');
        return (
          <Link key={job.id} to={`/jobs/${job.id}`} className="card pad-card onsite-card">
            <strong>{job.title}</strong>
            {items.map((s) => (
              <span key={s.id}>
                {s.title}
                {s.trade ? ` · ${s.trade}` : ''}
              </span>
            ))}
            {(waiting.length > 0 || requested.length > 0) && (
              <span className="waiting-text">
                {waiting.map((c) => `Change #${c.number} waiting on ${client}`).join(' · ')}
                {waiting.length > 0 && requested.length > 0 ? ' · ' : ''}
                {requested.length > 0 ? `Payment requested from ${client}` : ''}
              </span>
            )}
          </Link>
        );
      })}
    </section>
  );
}

function ProposalsSection({ quotes }: { quotes: QuoteRow[] }) {
  if (quotes.length === 0) return null;
  return (
    <section className="stack">
      <h2>Proposals out</h2>
      <ul className="card rows">
        {quotes.map((q) => {
          const views = [...q.quote_views].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at));
          const recent = views.filter((v) => daysAgo(v.viewed_at) < 1);
          const total = q.base_cents + q.quote_options.filter((o) => o.recommended).reduce((t, o) => t + o.price_cents, 0);
          const sentDays = Math.floor(daysAgo(q.sent_at));
          const hot = recent.length > 0;
          const cold = views.length === 0 && sentDays >= 3;
          const name = q.clients?.name ?? '';
          return (
            <li key={q.id} className="proposal-row">
              <span className={`dot ${hot ? 'hot' : views.length ? 'sent' : 'draft'}`} aria-hidden="true" />
              <Link to={`/quotes/${q.id}`} className="row-main plain-link">
                <strong>
                  {name} · {q.title} · {formatMoney(total)}
                </strong>
                <span className={hot ? 'hot-text small' : 'muted small'}>
                  {hot
                    ? `Opened ${recent.length === 1 ? 'once' : `${recent.length} times`} in the last day`
                    : views.length > 0
                      ? `Opened ${views.length === 1 ? 'once' : `${views.length} times`} · last ${formatWhen(views[0].viewed_at)}`
                      : `Not opened yet · sent ${sentDays === 0 ? 'today' : `${sentDays} day${sentDays === 1 ? '' : 's'} ago`}`}
                </span>
              </Link>
              {hot && q.clients?.phone && (
                <a href={`tel:${smsNumber(q.clients.phone)}`} className="btn small">
                  Call now
                </a>
              )}
              {cold && q.clients?.phone && (
                <a
                  href={smsHref(
                    q.clients.phone,
                    quoteNudgeMessage({ clientName: name, title: q.title, link: proposalLink(q.approval_token) }),
                  )}
                  className="btn small outline"
                >
                  Nudge
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MoneySection({ jobs }: { jobs: JobRow[] }) {
  const requested = jobs.flatMap((j) => j.payment_milestones.filter((m) => m.status === 'requested'));
  const owed = requested.reduce((t, m) => t + m.amount_cents, 0);
  const next = jobs
    .map((j) => [...j.payment_milestones].sort((a, b) => a.position - b.position).find((m) => m.status === 'upcoming'))
    .filter(Boolean);
  if (requested.length === 0 && next.length === 0) return null;
  return (
    <section className="stack">
      <h2>Money this week</h2>
      <Link to="/money" className="card hero-card money-link">
        <span className="small">
          {requested.length > 0
            ? `Requested, waiting on ${requested.length === 1 ? '1 payment' : `${requested.length} payments`}`
            : 'Nothing requested right now'}
        </span>
        <span className="hero-number">{formatMoney(owed)}</span>
        <span className="small">
          {next.length > 0 ? `${next.length} more payment${next.length === 1 ? '' : 's'} coming up · ` : ''}before HST
        </span>
        <span className="chevron" aria-hidden="true" />
      </Link>
    </section>
  );
}

function ComingUpSection({ jobs, today, weekOut }: { jobs: JobRow[]; today: string; weekOut: string }) {
  const items = jobs
    .flatMap((job) => job.job_schedule.map((s) => ({ ...s, jobTitle: job.title })))
    .filter((s) => s.starts_on > today && s.starts_on <= weekOut)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  if (items.length === 0) return null;
  return (
    <section className="stack">
      <h2>Coming up this week</h2>
      <ul className="card rows">
        {items.map((s) => (
          <li key={s.id}>
            <Link to={`/jobs/${s.job_id}?tab=schedule`} className="row-link">
              <span className="date-chip">{formatDateRange(s.starts_on)}</span>
              <span className="row-main">
                <strong>{s.title}</strong>
                <span className="muted small">
                  {s.jobTitle}
                  {s.trade ? ` · ${s.trade}` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
