import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { ErrorNote, Page } from '../components/Layout';

export function Settings() {
  const { contractor, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(contractor?.name ?? '');
  const [businessName, setBusinessName] = useState(contractor?.business_name ?? '');
  const [phone, setPhone] = useState(contractor?.phone ?? '');
  const [etransfer, setEtransfer] = useState(contractor?.etransfer_email ?? '');
  const [reviewUrl, setReviewUrl] = useState(contractor?.google_review_url ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!contractor) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    const { error } = await supabase
      .from('contractors')
      .update({
        name: name.trim(),
        business_name: businessName.trim(),
        phone: phone.trim(),
        etransfer_email: etransfer.trim() || null,
        google_review_url: reviewUrl.trim() || null,
      })
      .eq('id', contractor.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await refreshProfile();
    setSaved(true);
  }

  return (
    <Page>
      <h1>Settings</h1>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Your name</span>
          <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Business name</span>
          <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </label>
        <label className="field">
          <span>Mobile number</span>
          <input type="tel" inputMode="tel" required minLength={7} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <span className="hint">Clients text you here from their approval and proposal pages.</span>
        </label>
        <label className="field">
          <span>e-Transfer email</span>
          <input type="email" inputMode="email" value={etransfer} onChange={(e) => setEtransfer(e.target.value)} />
          <span className="hint">Added to payment requests so clients know where to send money.</span>
        </label>
        <label className="field">
          <span>Google review link</span>
          <input type="url" inputMode="url" placeholder="https://g.page/r/…" value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} />
          <span className="hint">
            On Google, search your business, tap Ask for reviews (or Share review form) and copy the link.
          </span>
        </label>
        <ErrorNote message={error} />
        {saved && (
          <p className="ok-note" role="status">
            Saved.
          </p>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
      <div className="footer-actions stack">
        <p className="muted small">Signed in as {session?.user.email}</p>
        <button type="button" className="btn secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </Page>
  );
}
