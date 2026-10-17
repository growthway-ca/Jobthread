import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage, formatDateRange, todayIso } from '../lib/format';
import type { JobData } from '../lib/useJob';
import type { ScheduleItem } from '../lib/types';
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
          Add what’s happening when: demo, trades, inspections, deliveries. Today shows what’s on, and the client page
          shows the dates you mark as visible.
        </p>
      )}
      {upcoming.length > 0 && (
        <ol className="schedule-list">
          {upcoming.map((s) => (
            <li key={s.id}>
              <ScheduleRow item={s} today={today} reload={reload} />
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
                <ScheduleRow item={s} today={today} reload={reload} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function ScheduleRow({ item: s, today, reload }: { item: ScheduleItem; today: string; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const onNow = s.starts_on <= today && (s.ends_on ?? s.starts_on) >= today;

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
    <article className={`card schedule-item ${onNow ? 'now' : ''}`}>
      <div className="schedule-date">
        <span>{formatDateRange(s.starts_on, s.ends_on)}</span>
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
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('job_schedule').insert({
      job_id: jobId,
      title: title.trim(),
      starts_on: startsOn,
      ends_on: endsOn || null,
      trade: trade.trim() || null,
      note: note.trim() || null,
      visible_to_client: visible,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setTitle('');
    setEndsOn('');
    setTrade('');
    setNote('');
    setOpen(false);
    await reload();
  }

  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Add to schedule
      </button>
    );
  }

  return (
    <form onSubmit={add} className="card pad-card stack">
      <h2>Add to schedule</h2>
      <label className="field">
        <span>What’s happening</span>
        <input required maxLength={120} placeholder="Electrical rough-in" value={title} onChange={(e) => setTitle(e.target.value)} />
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
      <label className="field">
        <span>Who (optional)</span>
        <input maxLength={80} placeholder="Electrician" value={trade} onChange={(e) => setTrade(e.target.value)} />
      </label>
      <label className="field">
        <span>Note (optional)</span>
        <input maxLength={500} placeholder="Power off 9 to 11" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
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
