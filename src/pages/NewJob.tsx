import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { parseDollars } from '../lib/money';
import { ErrorNote, Page } from '../components/Layout';
import { ClientPicker, resolveClient, type ClientChoice } from '../components/ClientPicker';

export function NewJob() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [client, setClient] = useState<ClientChoice>({ kind: 'new', name: '', phone: '' });
  const [contract, setContract] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const contractCents = parseDollars(contract);
    if (contractCents === null || contractCents < 0) {
      return setError('Enter the contract amount in dollars, like 25000 or 25,000.');
    }
    setBusy(true);
    setError(null);
    try {
      const clientId = await resolveClient(client);
      const jobId = crypto.randomUUID();
      const { error } = await supabase.from('jobs').insert({
        id: jobId,
        client_id: clientId,
        title: title.trim(),
        address: address.trim() || null,
        contract_cents: contractCents,
      });
      if (error) throw error;
      navigate(`/jobs/${jobId}`, { replace: true });
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err));
    }
  }

  return (
    <Page nav={false}>
      <Link to="/" className="back">
        Back to jobs
      </Link>
      <h1>New job</h1>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Job</span>
          <input required placeholder="Kitchen renovation" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Address</span>
          <input autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <ClientPicker value={client} onChange={setClient} />
        <label className="field">
          <span>Contract amount, before tax</span>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input inputMode="decimal" required value={contract} onChange={(e) => setContract(e.target.value)} />
          </div>
        </label>
        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Add job'}
        </button>
      </form>
    </Page>
  );
}
