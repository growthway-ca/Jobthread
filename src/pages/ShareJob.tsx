import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, projectLink } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { firstName, projectMessage } from '../lib/sms';
import { useJob } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';

/** Send the client their project page link (/jobs/:jobId/share). */
export function ShareJob() {
  const { jobId } = useParams();
  const { contractor } = useAuth();
  const { data, error: loadError, reload } = useJob(jobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return (
      <Page nav={false}>
        <ErrorNote message={loadError} />
        {!loadError && <Loading />}
      </Page>
    );
  }
  const { job, client } = data;
  const link = projectLink(job.share_token);
  const message = projectMessage({
    clientName: client.name,
    businessName: contractor?.business_name ?? '',
    jobTitle: job.title,
    link,
  });

  async function resetLink() {
    if (!window.confirm('Make a new link? The old one stops working, so you’ll need to send the new one.')) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('reset_job_share_token', { p_job_id: job.id });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  return (
    <Page nav={false}>
      <Link to={`/jobs/${job.id}`} className="back">
        Back to {job.title}
      </Link>
      <h1>Client page</h1>
      <p className="muted">
        One link {firstName(client.name) || client.name} keeps for the whole job: what’s left to pay, the payment
        schedule, changes and your daily updates. It updates on its own, so you only send it once.
      </p>
      <div>
        <p className="preview-label">{firstName(client.name) || client.name} will get this text:</p>
        <div className="card sms-preview">{message}</div>
      </div>
      <SendActions phone={client.phone} message={message} label={`Text ${firstName(client.name) || 'client'}`} />
      <a href={link} target="_blank" rel="noreferrer" className="btn plain">
        See what {firstName(client.name) || 'the client'} sees
      </a>
      <div className="footer-actions stack">
        <p className="muted small">
          Payment requests include this link too. Photos stay private to you for now; daily log text is shown.
        </p>
        <button type="button" className="btn small plain danger" disabled={busy} onClick={() => void resetLink()}>
          Make a new link
        </button>
        <ErrorNote message={error} />
      </div>
    </Page>
  );
}
