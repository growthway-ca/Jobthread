import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { ErrorNote, Header } from '../components/Layout';

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
    <>
      <Header
        linkHome={false}
        right={
          <button className="header-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        }
      />
      <main className="page narrow">
        <h1>About you</h1>
        <p className="muted">Clients see your business name and can text you at this number.</p>
        <form onSubmit={save} className="stack">
          <label className="field">
            <span>Your name</span>
            <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Business name</span>
            <input
              autoComplete="organization"
              required
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <ErrorNote message={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </main>
    </>
  );
}
