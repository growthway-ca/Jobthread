import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { ErrorNote } from '../components/Layout';
import { AuthShell } from '../components/AuthShell';

/** Shown once, right after the first sign-in. */
export function Profile() {
  const { refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('contractors').insert({
      name: name.trim(),
      business_name: businessName.trim(),
      phone: phone.trim(),
    });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    await refreshProfile();
  }

  return (
    <AuthShell
      hero={false}
      topRight={
        <button className="auth-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      }
    >
      <p className="auth-step">Last step</p>
      <h2 className="auth-title">Set up your business</h2>
      <p className="auth-sub">Clients see your business name on every change and quote, and can text you at this number.</p>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Your name</span>
          <input autoComplete="name" required placeholder="Braeden Keel" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Business name</span>
          <input
            autoComplete="organization"
            required
            placeholder="Keel Contracting"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Mobile number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            minLength={7}
            placeholder="705-555-0100"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Start using JobThread'}
        </button>
      </form>
    </AuthShell>
  );
}
