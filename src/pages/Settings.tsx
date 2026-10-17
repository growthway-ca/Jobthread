import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { ErrorNote, Page } from '../components/Layout';
import { InstallTip } from '../components/InstallTip';
import { feedbackHref } from '../lib/feedback';

export function Settings() {
  const { contractor, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(contractor?.name ?? '');
  const [businessName, setBusinessName] = useState(contractor?.business_name ?? '');
  const [phone, setPhone] = useState(contractor?.phone ?? '');
  const [etransfer, setEtransfer] = useState(contractor?.etransfer_email ?? '');
  const [reviewUrl, setReviewUrl] = useState(contractor?.google_review_url ?? '');
  const [rating, setRating] = useState(contractor?.google_rating?.toString() ?? '');
  const [reviewCount, setReviewCount] = useState(contractor?.google_review_count?.toString() ?? '');
  const [credentials, setCredentials] = useState(contractor?.credentials ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!contractor) return;
    const ratingValue = rating.trim() ? Number(rating) : null;
    if (ratingValue !== null && (Number.isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5)) {
      return setError('Google rating should be between 1 and 5, like 4.9.');
    }
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
        google_rating: ratingValue === null ? null : Math.round(ratingValue * 10) / 10,
        google_review_count: reviewCount.trim() ? Math.max(0, Math.round(Number(reviewCount))) || 0 : null,
        credentials: credentials.trim() || null,
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
        <div className="date-row">
          <label className="field">
            <span>Google rating</span>
            <input inputMode="decimal" placeholder="4.9" value={rating} onChange={(e) => setRating(e.target.value)} />
          </label>
          <label className="field">
            <span>Number of reviews</span>
            <input inputMode="numeric" placeholder="37" value={reviewCount} onChange={(e) => setReviewCount(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Credentials</span>
          <input maxLength={120} placeholder="Licensed and insured" value={credentials} onChange={(e) => setCredentials(e.target.value)} />
          <span className="hint">Rating, reviews and credentials show at the top of your proposals. Keep them current.</span>
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
      <section className="card pad-card stack-tight feedback-card">
        <h2>Something off, or an idea?</h2>
        <p className="muted small">JobThread is new and built with contractors like you. Tell us what’s confusing, broken or missing.</p>
        <a className="btn secondary" href={feedbackHref({ businessName: contractor?.business_name })}>
          Send feedback
        </a>
      </section>
      <InstallTip always />
      <div className="footer-actions stack">
        <p className="muted small">Signed in as {session?.user.email}</p>
        <button type="button" className="btn secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </Page>
  );
}
