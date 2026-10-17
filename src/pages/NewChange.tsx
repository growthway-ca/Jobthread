import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, approvalLink, publicBaseUrl } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { parseDollars } from '../lib/money';
import { changeMessage, firstName, NO_SCHEDULE_CHANGE, smsHref } from '../lib/sms';
import { useJob } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';
import { preparePhoto, uploadChangePhoto, type PreparedPhoto } from '../lib/photos';
import { REASON_LABELS, type ChangeReason } from '../lib/types';

type Schedule = 'none' | 'half' | 'day' | 'other';

const SCHEDULE_CHOICES: { value: Schedule; label: string }[] = [
  { value: 'none', label: 'No change' },
  { value: 'half', label: '+ ½ day' },
  { value: 'day', label: '+ 1 day' },
  { value: 'other', label: 'Other' },
];

const SCHEDULE_VALUES: Record<Exclude<Schedule, 'other'>, string> = {
  none: NO_SCHEDULE_CHANGE,
  half: 'Half a day',
  day: '1 day',
};

interface SentChange {
  number: number;
  message: string;
}

export function NewChange() {
  const { jobId } = useParams();
  const { data, error: loadError } = useJob(jobId);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [schedule, setSchedule] = useState<Schedule>('none');
  const [otherTime, setOtherTime] = useState('');
  const timeAdded = schedule === 'other' ? otherTime : SCHEDULE_VALUES[schedule];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentChange | null>(null);
  const [reason, setReason] = useState<ChangeReason>('client_asked');
  const [trade, setTrade] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [subNames, setSubNames] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('subcontractors')
      .select('name, trade')
      .then(({ data }) =>
        setSubNames(Array.from(new Set((data ?? []).flatMap((s) => [s.trade, s.name]).filter(Boolean) as string[]))),
      );
  }, []);

  async function pickPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(await preparePhoto(file));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!data) {
    return (
      <Page nav={false}>
        <ErrorNote message={loadError} />
        {!loadError && <Loading />}
      </Page>
    );
  }

  const { job, client, changes } = data;
  const nextNumber = changes.reduce((max, c) => Math.max(max, c.number), 0) + 1;
  const priceCents = parseDollars(price);

  const preview = changeMessage({
    clientName: client.name,
    number: nextNumber,
    jobTitle: job.title,
    description: description || 'what’s changing',
    priceCents: priceCents ?? 0,
    timeAdded: timeAdded || null,
    link: `${publicBaseUrl()}/a/…`,
  });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return setError('Say what’s changing.');
    if (priceCents === null) return setError('Enter the price in dollars, like 850 or 1,250.50.');
    if (schedule === 'other' && !otherTime.trim()) return setError('Say how much time this adds, like 3 days.');
    setBusy(true);
    setError(null);

    let photoPath: string | null = null;
    if (photo) {
      try {
        photoPath = await uploadChangePhoto(job.id, photo);
      } catch (err) {
        setBusy(false);
        return setError(errorMessage(err));
      }
    }

    const { data: row, error } = await supabase
      .from('changes')
      .insert({
        job_id: job.id,
        description: description.trim(),
        price_cents: priceCents,
        time_added: timeAdded.trim() || null,
        reason,
        trade: trade.trim() || null,
        photo_path: photoPath,
        status: 'sent',
      })
      .select('number, approval_token')
      .single();
    setBusy(false);
    if (error || !row) return setError(errorMessage(error));

    const message = changeMessage({
      clientName: client.name,
      number: row.number,
      jobTitle: job.title,
      description: description.trim(),
      priceCents,
      timeAdded: timeAdded.trim() || null,
      link: approvalLink(row.approval_token),
    });
    setSent({ number: row.number, message });
    window.scrollTo(0, 0);
    // Opening a URL scheme is a navigation, not a pop-up, so it still works
    // after the await. If the phone ignores it, the buttons below are there.
    window.location.href = smsHref(client.phone, message);
  }

  if (sent) {
    return (
      <Page nav={false}>
        <h1>Change #{sent.number} is ready to send</h1>
        <p className="muted">
          Send this from your Messages app to {client.name}. If Messages didn’t open, tap the button below or copy
          the text.
        </p>
        <div className="card sms-preview" aria-label="Text message">
          {sent.message}
        </div>
        <SendActions phone={client.phone} message={sent.message} />
        <Link to={`/jobs/${job.id}`} className="btn plain">
          Back to {job.title}
        </Link>
      </Page>
    );
  }

  return (
    <Page nav={false}>
      <Link to={`/jobs/${job.id}`} className="back">
        Back to {job.title}
      </Link>
      <h1>New change</h1>
      <p className="muted">
        Change #{nextNumber} for {client.name.replace(/\.$/, '')}. Once sent, it can’t be edited. To fix a mistake, void it and send a new
        one.
      </p>
      <form onSubmit={send} className="stack">
        <label className="field">
          <span>What’s changing</span>
          <textarea
            rows={3}
            required
            maxLength={1000}
            placeholder="Add four pot lights over the island"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Price, before tax</span>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <span className="hint">For a credit, put a minus sign in front.</span>
        </label>
        <fieldset className="field chips-field">
          <legend>Why</legend>
          <div className="chips">
            {(Object.keys(REASON_LABELS) as ChangeReason[]).map((r) => (
              <button
                key={r}
                type="button"
                className={reason === r ? 'chip selected' : 'chip'}
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
              >
                {REASON_LABELS[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Who does it (optional)</span>
          <input list="trade-list" maxLength={80} placeholder="Electrician" value={trade} onChange={(e) => setTrade(e.target.value)} />
          <datalist id="trade-list">
            {subNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <div className="field">
          <span>Photo of the spot (optional)</span>
          {photo ? (
            <div className="photo single">
              <img src={photo.previewUrl} alt="" />
              <button
                type="button"
                className="photo-remove"
                aria-label="Remove photo"
                onClick={() => {
                  URL.revokeObjectURL(photo.previewUrl);
                  setPhoto(null);
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <label className="photo-add">
              <input type="file" accept="image/*" onChange={(e) => void pickPhoto(e.target.files)} />
              <span>Add a photo of the spot</span>
            </label>
          )}
          <span className="hint">{firstName(client.name) || 'The client'} sees it on the approval page.</span>
        </div>
        <fieldset className="field chips-field">
          <legend>Schedule</legend>
          <div className="chips">
            {SCHEDULE_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={schedule === choice.value ? 'chip selected' : 'chip'}
                aria-pressed={schedule === choice.value}
                onClick={() => setSchedule(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
          {schedule === 'other' && (
            <input
              aria-label="Time this adds"
              maxLength={80}
              placeholder="3 days"
              autoFocus
              value={otherTime}
              onChange={(e) => setOtherTime(e.target.value)}
            />
          )}
        </fieldset>

        <div>
          <p className="preview-label">{firstName(client.name) || client.name} will get this text:</p>
          <div className="card sms-preview" aria-live="polite">
            {preview}
          </div>
        </div>

        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Send'}
        </button>
      </form>
    </Page>
  );
}
