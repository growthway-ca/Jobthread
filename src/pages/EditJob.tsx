import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { parseDollars } from '../lib/money';
import { useJob } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';

export function EditJob() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { data, error: loadError } = useJob(jobId);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [contract, setContract] = useState('');
  const [holdback, setHoldback] = useState(false);
  const [releaseDate, setReleaseDate] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || loaded) return;
    setTitle(data.job.title);
    setAddress(data.job.address ?? '');
    setContract((data.job.contract_cents / 100).toFixed(2));
    setHoldback(Number(data.job.holdback_rate) > 0);
    setReleaseDate(data.job.holdback_release_date ?? '');
    setLoaded(true);
  }, [data, loaded]);

  if (!data) {
    return (
      <Page nav={false}>
        <ErrorNote message={loadError} />
        {!loadError && <Loading />}
      </Page>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const contractCents = parseDollars(contract);
    if (contractCents === null || contractCents < 0) return setError('Enter the contract amount in dollars.');
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('jobs')
      .update({
        title: title.trim(),
        address: address.trim() || null,
        contract_cents: contractCents,
        holdback_rate: holdback ? 0.1 : 0,
        holdback_release_date: holdback && releaseDate ? releaseDate : null,
      })
      .eq('id', data!.job.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    navigate(`/jobs/${data!.job.id}`, { replace: true });
  }

  return (
    <Page nav={false}>
      <Link to={`/jobs/${data.job.id}`} className="back">
        Back to {data.job.title}
      </Link>
      <h1>Edit job</h1>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Job</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="field">
          <span>Original contract, before tax</span>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input inputMode="decimal" required value={contract} onChange={(e) => setContract(e.target.value)} />
          </div>
          <span className="hint">Changes are added on top of this. They stay as they are on record.</span>
        </label>

        <label className="check-row">
          <input type="checkbox" checked={holdback} onChange={(e) => setHoldback(e.target.checked)} />
          <span>
            <strong>10% holdback</strong>
            <span className="muted small block">The client keeps back 10% until the lien period ends.</span>
          </span>
        </label>
        {holdback && (
          <label className="field">
            <span>Release date</span>
            <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </label>
        )}

        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Page>
  );
}
