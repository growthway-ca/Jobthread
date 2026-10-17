import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, sheetLink } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage, formatDateRange, formatWhen } from '../lib/format';
import { sheetMessage } from '../lib/sms';
import { useJob, type JobData } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';
import type { JobSheet, JobSheetView, JobSite, Subcontractor } from '../lib/types';

type SheetRow = JobSheet & { job_sheet_views: JobSheetView[] };

/** Site info for the job and the sheets sent to trades (/jobs/:jobId/site). */
export function SiteInfo() {
  const { jobId } = useParams();
  const { data, error: loadError } = useJob(jobId);
  const [site, setSite] = useState<JobSite | null | undefined>(undefined);
  const [sheets, setSheets] = useState<SheetRow[]>([]);

  const loadSheets = useCallback(async () => {
    if (!jobId) return;
    const [siteRes, sheetsRes] = await Promise.all([
      supabase.from('job_site').select('*').eq('job_id', jobId).maybeSingle(),
      supabase.from('job_sheets').select('*, job_sheet_views(*)').eq('job_id', jobId).order('created_at', { ascending: false }),
    ]);
    setSite((siteRes.data as JobSite | null) ?? null);
    setSheets((sheetsRes.data ?? []) as SheetRow[]);
  }, [jobId]);

  useEffect(() => {
    void loadSheets();
    const onVisible = () => document.visibilityState === 'visible' && void loadSheets();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadSheets]);

  if (!data || site === undefined) {
    return (
      <Page nav={false}>
        <ErrorNote message={loadError} />
        {!loadError && <Loading />}
      </Page>
    );
  }

  return (
    <Page nav={false}>
      <Link to={`/jobs/${data.job.id}`} className="back">
        Back to {data.job.title}
      </Link>
      <h1>Job sheets</h1>
      <p className="muted">
        Give each trade a link with the address, how to get in and what to know on site. The lockbox code stays hidden
        until they tap it, and every view is logged with their name. Links stop working when you close them or mark the
        job done.
      </p>
      <SheetsSection data={data} site={site} sheets={sheets} reload={loadSheets} />
      <SiteForm jobId={data.job.id} site={site} onSaved={loadSheets} />
    </Page>
  );
}

function SheetsSection({
  data,
  site,
  sheets,
  reload,
}: {
  data: JobData;
  site: JobSite | null;
  sheets: SheetRow[];
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(sheets.length === 0);
  const open = sheets.filter((s) => !s.closed_at);
  const closed = sheets.filter((s) => s.closed_at);

  return (
    <section className="stack">
      <div className="title-row">
        <h2>Sent to trades</h2>
        {!adding && (
          <button type="button" className="btn small plain" onClick={() => setAdding(true)}>
            New sheet
          </button>
        )}
      </div>
      {!site && <p className="notice">Fill in the site info below first, so the sheet has something to show.</p>}
      {adding && (
        <NewSheet
          data={data}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}
      {open.map((s) => (
        <SheetCard key={s.id} sheet={s} data={data} reload={reload} />
      ))}
      {closed.length > 0 && (
        <details className="past">
          <summary>Closed ({closed.length})</summary>
          <div className="stack">
            {closed.map((s) => (
              <SheetCard key={s.id} sheet={s} data={data} reload={reload} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function sheetWhen(data: JobData, sheet: JobSheet): { title: string | null; when: string | null } {
  const item = data.schedule.find((x) => x.id === sheet.schedule_item_id);
  return {
    title: sheet.title ?? item?.title ?? null,
    when: item ? formatDateRange(item.starts_on, item.ends_on) : null,
  };
}

function SheetCard({ sheet, data, reload }: { sheet: SheetRow; data: JobData; reload: () => Promise<void> }) {
  const { contractor } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { title, when } = sheetWhen(data, sheet);
  const views = [...sheet.job_sheet_views].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at));
  const opens = views.filter((v) => v.kind === 'opened');
  const codes = views.filter((v) => v.kind === 'code');
  const message = sheetMessage({
    tradeName: sheet.trade_name,
    title,
    address: data.job.address,
    when,
    contractorName: contractor?.name ?? '',
    businessName: contractor?.business_name ?? '',
    link: sheetLink(sheet.token),
  });

  async function setClosed(closed: boolean) {
    if (closed && !window.confirm(`Close ${sheet.trade_name}'s link? It stops working right away.`)) return;
    const { error } = await supabase
      .from('job_sheets')
      .update({ closed_at: closed ? new Date().toISOString() : null })
      .eq('id', sheet.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  return (
    <article className={`card pad-card sheet-card ${sheet.closed_at ? 'closed' : ''}`}>
      <div className="item-meta-row">
        <strong>{sheet.trade_name}</strong>
        <span className="muted small">{sheet.closed_at ? `Closed ${formatWhen(sheet.closed_at)}` : `Sent ${formatWhen(sheet.created_at)}`}</span>
      </div>
      {(title || when) && (
        <span className="muted">
          {title}
          {title && when ? ' · ' : ''}
          {when}
        </span>
      )}
      <ul className="view-log">
        {opens.length === 0 && codes.length === 0 && <li className="muted small">Not opened yet</li>}
        {opens.length > 0 && (
          <li className="small">
            Opened {opens.length === 1 ? 'once' : `${opens.length} times`}, last {formatWhen(opens[0].viewed_at)}
          </li>
        )}
        {codes.map((v) => (
          <li key={v.id} className="small code-view">
            Lockbox code viewed by <strong>{v.viewer_name}</strong>, {formatWhen(v.viewed_at)}
          </li>
        ))}
      </ul>
      {!sheet.closed_at && (
        <>
          {sheet.trade_phone ? (
            <SendActions phone={sheet.trade_phone} message={message} label="Text the link" compact>
              <a href={sheetLink(sheet.token)} target="_blank" rel="noreferrer" className="btn small plain">
                Preview
              </a>
            </SendActions>
          ) : (
            <div className="row-actions">
              <a href={sheetLink(sheet.token)} target="_blank" rel="noreferrer" className="btn small plain">
                Preview
              </a>
            </div>
          )}
          <button type="button" className="btn small plain danger" onClick={() => void setClosed(true)}>
            Close link
          </button>
        </>
      )}
      {sheet.closed_at && (
        <button type="button" className="btn small plain" onClick={() => void setClosed(false)}>
          Reopen link
        </button>
      )}
      <ErrorNote message={error} />
    </article>
  );
}

function NewSheet({ data, onDone }: { data: JobData; onDone: () => Promise<void> }) {
  const [tradeName, setTradeName] = useState('');
  const [tradePhone, setTradePhone] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subcontractor[]>([]);

  useEffect(() => {
    supabase
      .from('subcontractors')
      .select('*')
      .order('name')
      .then(({ data }) => setSubs((data ?? []) as Subcontractor[]));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('job_sheets').insert({
      job_id: data.job.id,
      trade_name: tradeName.trim(),
      trade_phone: tradePhone.trim() || null,
      schedule_item_id: scheduleId || null,
      title: scheduleId ? null : title.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await onDone();
  }

  return (
    <form onSubmit={save} className="card pad-card stack">
      <h2>New sheet</h2>
      {subs.length > 0 && (
        <label className="field">
          <span>From your subs</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const s = subs.find((x) => x.id === e.target.value);
              if (s) {
                setTradeName(s.name);
                setTradePhone(s.phone ?? '');
              }
            }}
          >
            <option value="">Pick a sub, or type below</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.trade ? ` · ${s.trade}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Trade or company</span>
        <input required maxLength={120} placeholder="Sparks Electric" value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
      </label>
      <label className="field">
        <span>Their mobile</span>
        <input type="tel" inputMode="tel" maxLength={30} value={tradePhone} onChange={(e) => setTradePhone(e.target.value)} />
      </label>
      {data.schedule.length > 0 && (
        <label className="field">
          <span>Which work</span>
          <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
            <option value="">Not on the schedule</option>
            {data.schedule.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {formatDateRange(s.starts_on, s.ends_on)}
              </option>
            ))}
          </select>
        </label>
      )}
      {!scheduleId && (
        <label className="field">
          <span>What they’re doing (optional)</span>
          <input maxLength={120} placeholder="Electrical rough-in" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}
      <ErrorNote message={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : 'Make the sheet'}
      </button>
      <button type="button" className="btn plain" onClick={() => void onDone()}>
        Cancel
      </button>
    </form>
  );
}

const FIELDS: { key: keyof Omit<JobSite, 'job_id' | 'updated_at'>; label: string; placeholder: string; long?: boolean; hint?: string }[] = [
  { key: 'parking', label: 'Parking', placeholder: 'Park on the left side of the driveway' },
  { key: 'access', label: 'Getting in', placeholder: 'Lockbox on the side door. No alarm.' },
  { key: 'access_code', label: 'Lockbox or door code', placeholder: '4821', hint: 'Hidden until a trade taps Show code and types their name.' },
  { key: 'heads_up', label: 'Heads up', placeholder: 'Cat in the house. Keep the laundry room door closed.\nQuiet please 1:00 to 3:00, nap time.', long: true, hint: 'One per line.' },
  { key: 'washroom', label: 'Washroom', placeholder: 'Main-floor powder room, top of the stairs' },
  { key: 'water', label: 'Water', placeholder: 'Laundry sink, utility room' },
  { key: 'power', label: 'Power', placeholder: 'Outlets beside the panel, utility room' },
  { key: 'notes', label: 'Anything else', placeholder: 'Shoe covers inside, please', long: true },
];

function SiteForm({ jobId, site, onSaved }: { jobId: string; site: JobSite | null; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, site?.[f.key] ?? ''])),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    const row = Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key].trim() || null]));
    const { error } = site
      ? await supabase.from('job_site').update(row).eq('job_id', jobId)
      : await supabase.from('job_site').insert({ job_id: jobId, ...row });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSaved(true);
    await onSaved();
  }

  return (
    <form onSubmit={save} className="stack">
      <h2>Site info</h2>
      <p className="muted small">Shared by every sheet on this job. Changes show up on links you’ve already sent.</p>
      {FIELDS.map((f) => (
        <label key={f.key} className="field">
          <span>{f.label}</span>
          {f.long ? (
            <textarea
              rows={3}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          ) : (
            <input
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          )}
          {f.hint && <span className="hint">{f.hint}</span>}
        </label>
      ))}
      <ErrorNote message={error} />
      {saved && (
        <p className="ok-note" role="status">
          Saved.
        </p>
      )}
      <button className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save site info'}
      </button>
    </form>
  );
}
