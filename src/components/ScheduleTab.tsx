import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage, formatDateRange, todayIso } from '../lib/format';
import type { JobData } from '../lib/useJob';
import type { Client, ScheduleItem } from '../lib/types';
import { smsHref } from '../lib/sms';
import { UTILITIES, formatTimeRange, shutoffMessage, shutoffWhen, utilityLabel, type Utility } from '../lib/shutoffs';
import { ErrorNote } from './Layout';

/** What's happening on which dates. Feeds Today and the client page. */
export function ScheduleTab({ data, reload }: { data: JobData; reload: () => Promise<void> }) {
  const today = todayIso();
  const items = data.schedule;
  const upcoming = items.filter((s) => (s.ends_on ?? s.starts_on) >= today);
  const past = items.filter((s) => (s.ends_on ?? s.starts_on) < today);

  return (
    <section aria-label="Schedule" className="stack">
      {items.length === 0 && (
        <p className="muted">
          Add what’s happening when: demo, trades, inspections, deliveries, and any time the water, power or gas will
          be off. Today shows what’s on, and the client page shows the dates you mark as visible.
        </p>
      )}
      {upcoming.length > 0 && (
        <ol className="schedule-list">
          {upcoming.map((s) => (
            <li key={s.id}>
              <ScheduleRow item={s} client={data.client} today={today} reload={reload} />
            </li>
          ))}
        </ol>
      )}
      <AddScheduleItem jobId={data.job.id} reload={reload} />
      {past.length > 0 && (
        <details className="past">
          <summary>Done ({past.length})</summary>
          <ol className="schedule-list">
            {past.map((s) => (
              <li key={s.id}>
                <ScheduleRow item={s} client={data.client} today={today} reload={reload} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function ScheduleRow({
  item: s,
  client,
  today,
  reload,
}: {
  item: ScheduleItem;
  client: Client;
  today: string;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const onNow = s.starts_on <= today && (s.ends_on ?? s.starts_on) >= today;
  const upcoming = (s.ends_on ?? s.starts_on) >= today;
  const time = formatTimeRange(s.from_time, s.to_time);

  async function remove() {
    if (!window.confirm(`Remove “${s.title}” from the schedule?`)) return;
    const { error } = await supabase.from('job_schedule').delete().eq('id', s.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  async function toggleVisible() {
    const { error } = await supabase
      .from('job_schedule')
      .update({ visible_to_client: !s.visible_to_client })
      .eq('id', s.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  return (
    <article className={`card schedule-item ${onNow ? 'now' : ''} ${s.utility ? 'shutoff' : ''}`}>
      <div className="schedule-date">
        <span>
          {formatDateRange(s.starts_on, s.ends_on)}
          {time && `, ${time}`}
        </span>
        {s.utility && <span className="pill shutoff-pill">{utilityLabel(s.utility)} off</span>}
        {onNow && <span className="pill approved-pill">On now</span>}
      </div>
      <strong>{s.title}</strong>
      {(s.trade || s.note) && (
        <span className="muted small">
          {s.trade}
          {s.trade && s.note ? ' · ' : ''}
          {s.note}
        </span>
      )}
      {s.utility && upcoming && (
        <a
          className="btn small secondary"
          href={smsHref(
            client.phone,
            shutoffMessage({ clientName: client.name, utility: s.utility, when: shutoffWhen(s), note: s.note }),
          )}
        >
          Text {client.name.split(' ')[0]} a heads-up
        </a>
      )}
      <div className="row-actions">
        <button type="button" className="btn small plain" onClick={() => void toggleVisible()}>
          {s.visible_to_client ? 'Shown to client' : 'Hidden from client'}
        </button>
        <button type="button" className="btn small plain danger" onClick={() => void remove()}>
          Remove
        </button>
      </div>
      <ErrorNote message={error} />
    </article>
  );
}

function AddScheduleItem({ jobId, reload }: { jobId: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [utility, setUtility] = useState<Utility | null>(null);
  const [shutoff, setShutoff] = useState(false);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState('');
  const [trade, setTrade] = useState('');
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (endsOn && endsOn < startsOn) return setError('The end date can’t be before the start.');
    if (shutoff && !utility) return setError('Pick what’s being shut off.');
    if (shutoff && fromTime && toTime && toTime <= fromTime) return setError('The end time has to be after the start.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('job_schedule').insert({
      job_id: jobId,
      title: title.trim() || (shutoff && utility ? `${utilityLabel(utility)} off` : ''),
      starts_on: startsOn,
      ends_on: endsOn || null,
      trade: trade.trim() || null,
      note: note.trim() || null,
      visible_to_client: visible,
      utility: shutoff ? utility : null,
      from_time: shutoff ? fromTime || null : null,
      to_time: shutoff ? toTime || null : null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setTitle('');
    setEndsOn('');
    setTrade('');
    setNote('');
    setFromTime('');
    setToTime('');
    setUtility(null);
    setShutoff(false);
    setOpen(false);
    await reload();
  }

  function start(asShutoff: boolean) {
    setShutoff(asShutoff);
    setError(null);
    setOpen(true);
  }

  if (!open) {
    return (
      <div className="schedule-add">
        <button type="button" className="btn secondary" onClick={() => start(false)}>
          Add to schedule
        </button>
        <button type="button" className="btn secondary" onClick={() => start(true)}>
          Plan a shutoff
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={add} className="card pad-card stack">
      <h2>{shutoff ? 'Plan a shutoff' : 'Add to schedule'}</h2>
      <div className="seg" role="group" aria-label="Kind">
        <button type="button" className={!shutoff ? 'selected' : ''} aria-pressed={!shutoff} onClick={() => setShutoff(false)}>
          Work
        </button>
        <button type="button" className={shutoff ? 'selected' : ''} aria-pressed={shutoff} onClick={() => setShutoff(true)}>
          Shutoff
        </button>
      </div>
      {shutoff && (
        <fieldset className="chips-field">
          <legend>What’s off</legend>
          <div className="chips">
            {UTILITIES.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`chip ${utility === u.id ? 'selected' : ''}`}
                aria-pressed={utility === u.id}
                onClick={() => setUtility(u.id)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>{shutoff ? 'Title (optional)' : 'What’s happening'}</span>
        <input
          required={!shutoff}
          maxLength={120}
          placeholder={shutoff ? (utility ? `${utilityLabel(utility)} off` : 'Water off') : 'Electrical rough-in'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="date-row">
        <label className="field">
          <span>Starts</span>
          <input type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="field">
          <span>Ends (optional)</span>
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      {shutoff && (
        <div className="date-row">
          <label className="field">
            <span>Off from</span>
            <input type="time" step={900} value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Back on by</span>
            <input type="time" step={900} value={toTime} onChange={(e) => setToTime(e.target.value)} />
          </label>
        </div>
      )}
      <label className="field">
        <span>Who (optional)</span>
        <input maxLength={80} placeholder="Electrician" value={trade} onChange={(e) => setTrade(e.target.value)} />
      </label>
      <label className="field">
        <span>{shutoff ? 'What it’s for (optional)' : 'Note (optional)'}</span>
        <input
          maxLength={500}
          placeholder={shutoff ? 'Vanity swap' : 'Bring the tile samples'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {shutoff && (
        <p className="muted small">
          It shows on Today and the trades’ job sheets, and you can text the client a heads-up the day before.
        </p>
      )}
      <label className="check-row">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        <span>Show on the client page</span>
      </label>
      <ErrorNote message={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button type="button" className="btn plain" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
