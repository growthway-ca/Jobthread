import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, approvalLink, publicBaseUrl } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { parseDollars } from '../lib/money';
import { changeMessage, firstName, smsHref } from '../lib/sms';
import { useJob } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';

interface SentChange {
  number: number;
  message: string;
}

export function NewChange() {
  const { jobId } = useParams();
  const { data, error: loadError } = useJob(jobId);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [timeAdded, setTimeAdded] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentChange | null>(null);

  if (!data) {
    return (
      <Page>
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
    setBusy(true);
    setError(null);

    const { data: row, error } = await supabase
      .from('changes')
      .insert({
        job_id: job.id,
        description: description.trim(),
        price_cents: priceCents,
        time_added: timeAdded.trim() || null,
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
      <Page>
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
    <Page>
      <Link to={`/jobs/${job.id}`} className="back">
        Back to {job.title}
      </Link>
      <h1>New change</h1>
      <p className="muted">
        Change #{nextNumber} for {client.name}. Once sent, it can’t be edited. To fix a mistake, void it and send a new
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
        <label className="field">
          <span>Time added</span>
          <input
            maxLength={80}
            placeholder="Half a day"
            value={timeAdded}
            onChange={(e) => setTimeAdded(e.target.value)}
          />
        </label>

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
