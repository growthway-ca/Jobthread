import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDateRange } from '../lib/format';
import { smsHref, smsNumber } from '../lib/sms';
import { ErrorNote, Header, Loading } from '../components/Layout';
import type { PublicJobSheet } from '../lib/types';
import { shutoffTitle, shutoffWhen, utilityLabel } from '../lib/shutoffs';

/** The page a trade opens from their job sheet text (/s/:token). No sign-in. */
export function JobSheetPage() {
  const { token = '' } = useParams();
  const [sheet, setSheet] = useState<PublicJobSheet | null | undefined>(undefined);

  useEffect(() => {
    supabase.rpc('get_job_sheet', { p_token: token }).then(({ data, error }) => {
      setSheet(error ? null : ((data as PublicJobSheet | null) ?? null));
    });
  }, [token]);

  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow">
        {sheet === undefined && <Loading />}
        {sheet === null && (
          <div className="card pad-card">
            <h1>This link doesn’t work</h1>
            <p>It may have been cut off. Ask whoever sent it to send it again.</p>
          </div>
        )}
        {sheet?.closed && (
          <div className="card pad-card">
            <h1>This job sheet is closed</h1>
            <p>{sheet.business_name} closed this link or finished the job. Text them if you still need the details.</p>
          </div>
        )}
        {sheet && !sheet.closed && <SheetView token={token} sheet={sheet} />}
      </main>
    </>
  );
}

function SheetView({ token, sheet: s }: { token: string; sheet: PublicJobSheet }) {
  const headsUp = (s.heads_up ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const onSite = [
    ['Washroom', s.washroom],
    ['Water', s.water],
    ['Power', s.power],
  ].filter(([, v]) => v) as [string, string][];
  const mapsUrl = s.address ? `https://maps.google.com/?q=${encodeURIComponent(s.address)}` : null;

  return (
    <div className="stack">
      <div className="sheet-head">
        <p className="from">From {s.business_name} · link closes when the job does</p>
        <h1>Job sheet{s.title ? `: ${s.title}` : ''}</h1>
        <p className="muted">
          For {s.trade_name}
          {s.starts_on ? ` · ${formatDateRange(s.starts_on, s.ends_on)}` : ''}
        </p>
      </div>

      {s.address && (
        <div className="card pad-card stack-tight">
          <div>
            <p className="label-sm">Address</p>
            <strong className="sheet-address">{s.address}</strong>
            {s.parking && <p className="muted small">{s.parking}</p>}
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn secondary">
              Open in Maps
            </a>
          )}
        </div>
      )}

      {(s.access || s.has_code) && <AccessCard token={token} access={s.access ?? null} hasCode={Boolean(s.has_code)} />}

      {headsUp.length > 0 && (
        <section className="stack">
          <h2>Heads up</h2>
          <div className="card pad-card heads-up">
            {headsUp.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </section>
      )}

      {s.shutoffs && s.shutoffs.length > 0 && (
        <section className="stack">
          <h2>Shutoffs</h2>
          <ul className="card rows">
            {s.shutoffs.map((so, i) => (
              <li key={i} className="row-link static">
                <span className="row-main">
                  <strong>
                    <span className="pill shutoff-pill">{utilityLabel(so.utility)} off</span> {shutoffWhen(so)}
                  </strong>
                  {(shutoffTitle(so.title, so.utility) || so.note) && (
                    <span className="muted small">{[shutoffTitle(so.title, so.utility), so.note].filter(Boolean).join(' · ')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onSite.length > 0 && (
        <section className="stack">
          <h2>On site</h2>
          <dl className="card on-site">
            {onSite.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {s.notes && (
        <section className="stack">
          <h2>Also</h2>
          <p className="card pad-card item-body">{s.notes}</p>
        </section>
      )}

      {s.contractor_phone && (
        <div className="action-grid">
          <a href={`tel:${smsNumber(s.contractor_phone)}`} className="btn secondary">
            Call {s.contractor_name?.split(' ')[0] || s.business_name}
          </a>
          <a href={smsHref(s.contractor_phone, `Hi, about ${s.title ?? 'the job'} at ${s.address ?? s.job_title}: `)} className="btn secondary">
            Text
          </a>
        </div>
      )}
    </div>
  );
}

function AccessCard({ token, access, hasCode }: { token: string; access: string | null; hasCode: boolean }) {
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('reveal_access_code', { p_token: token, p_name: name });
    setBusy(false);
    if (error) {
      if (error.message === 'name_required') return setError('Type your name first.');
      if (error.message === 'closed') return setError('This job sheet was just closed.');
      if (error.message === 'too_many') return setError('The code has been viewed a lot today. Call the contractor.');
      return setError('That didn’t work. Check your signal and try again.');
    }
    setCode(data as string);
  }

  return (
    <div className="card dark-total access-card">
      <span className="small">Getting in</span>
      {access && <p className="access-text">{access}</p>}
      {hasCode &&
        (code ? (
          <span className="code-shown">{code}</span>
        ) : asking ? (
          <form onSubmit={reveal} className="stack-tight">
            <label className="field on-dark">
              <span>Your name</span>
              <input autoComplete="name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <ErrorNote message={error} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Getting the code…' : 'Show code'}
            </button>
          </form>
        ) : (
          <div className="code-row">
            <span className="code-dots" aria-label="Code hidden">
              ••••
            </span>
            <button type="button" className="btn small" onClick={() => setAsking(true)}>
              Show code
            </button>
          </div>
        ))}
      {hasCode && <p className="small">Every view is logged with your name and the time.</p>}
    </div>
  );
}
