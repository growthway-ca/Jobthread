import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { ErrorNote } from './Layout';

const HIDE_KEY = 'jt-start-here-hidden';
/** Practice jobs are named with this prefix so they don't count as real ones. */
const PRACTICE = 'Practice:';

interface Progress {
  firstJobId: string | null;
  hasJob: boolean;
  hasSent: boolean;
  hasApproved: boolean;
  practiceToken: string | null;
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Start here" on Today for new accounts: add a job, send a change, and see
 * the client's side by approving a change on a practice job. Hides itself once
 * all three are done, or when dismissed.
 */
export function StartHere() {
  const { contractor } = useAuth();
  const [hidden, setHidden] = useState(readHidden);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jobsRes, changesRes] = await Promise.all([
      supabase.from('jobs').select('id, title').order('created_at', { ascending: true }),
      supabase.from('changes').select('status, approval_token, jobs!inner(title)').neq('status', 'draft'),
    ]);
    if (jobsRes.error || changesRes.error) return; // the card is a nicety; Today shows its own errors
    const jobs = jobsRes.data ?? [];
    const changes = (changesRes.data ?? []) as unknown as {
      status: string;
      approval_token: string;
      jobs: { title: string };
    }[];
    const real = (title: string) => !title.startsWith(PRACTICE);
    const realJobs = jobs.filter((j) => real(j.title));
    const practiceSent = changes.find((c) => !real(c.jobs.title) && c.status === 'sent');
    setProgress({
      firstJobId: realJobs[0]?.id ?? null,
      hasJob: realJobs.length > 0,
      hasSent: changes.some((c) => real(c.jobs.title)),
      hasApproved: changes.some((c) => c.status === 'approved'),
      practiceToken: practiceSent?.approval_token ?? null,
    });
  }, []);

  useEffect(() => {
    if (hidden) return;
    void load();
  }, [hidden, load]);

  if (hidden || !progress || !contractor) return null;
  const { hasJob, hasSent, hasApproved, firstJobId, practiceToken } = progress;
  if (hasJob && hasSent && hasApproved) return null;

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      // Private mode: it shows again next time.
    }
    setHidden(true);
  }

  // A job with you as the client and one change waiting, so you can approve it the way a client would.
  async function makePractice() {
    if (!contractor) return;
    setBusy(true);
    setError(null);
    try {
      const clientId = crypto.randomUUID();
      const jobId = crypto.randomUUID();
      const c = await supabase.from('clients').insert({ id: clientId, name: `${contractor.name} (practice client)`, phone: contractor.phone });
      if (c.error) throw c.error;
      const j = await supabase
        .from('jobs')
        .insert({ id: jobId, client_id: clientId, title: `${PRACTICE} basement finish`, contract_cents: 2500000 });
      if (j.error) throw j.error;
      const ch = await supabase.from('changes').insert({
        job_id: jobId,
        description: 'Add a pot light over the stair landing',
        price_cents: 18500,
        time_added: null,
        reason: 'client_asked',
        status: 'sent',
      });
      if (ch.error) throw ch.error;
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card pad-card start-here" aria-labelledby="start-here-title">
      <div className="start-here-head">
        <h2 id="start-here-title">Start here</h2>
        <button type="button" className="btn small plain" onClick={hide}>
          Hide
        </button>
      </div>
      <ol className="start-steps">
        <li className={hasJob ? 'done' : ''}>
          <span className="start-tick" aria-hidden="true" />
          <div>
            <strong>Add your first job</strong>
            <span>The client, the address and the contract price.</span>
            {!hasJob && (
              <Link to="/jobs/new" className="btn small">
                Add a job
              </Link>
            )}
          </div>
          {hasJob && <span className="sr-only">Done.</span>}
        </li>
        <li className={hasSent ? 'done' : ''}>
          <span className="start-tick" aria-hidden="true" />
          <div>
            <strong>Send your first change</strong>
            <span>Price it, and JobThread writes the text for your Messages app.</span>
            {!hasSent && firstJobId && (
              <Link to={`/jobs/${firstJobId}/changes/new`} className="btn small">
                New change
              </Link>
            )}
          </div>
          {hasSent && <span className="sr-only">Done.</span>}
        </li>
        <li className={hasApproved ? 'done' : ''}>
          <span className="start-tick" aria-hidden="true" />
          <div>
            <strong>See what your client sees</strong>
            <span>Approve a change yourself on a job marked Practice, with you as the client. Mark it done when you’re finished.</span>
            {!hasApproved &&
              (practiceToken ? (
                <Link to={`/a/${practiceToken}`} className="btn small">
                  Open it as your client
                </Link>
              ) : (
                <button type="button" className="btn small" disabled={busy} onClick={() => void makePractice()}>
                  {busy ? 'Setting it up…' : 'Try a practice job'}
                </button>
              ))}
          </div>
          {hasApproved && <span className="sr-only">Done.</span>}
        </li>
      </ol>
      <ErrorNote message={error} />
    </section>
  );
}
