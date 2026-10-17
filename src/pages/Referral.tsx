import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ErrorNote, Header, Loading } from '../components/Layout';

interface ReferralPage {
  business_name: string;
  referrer_first_name: string;
}

/** Public page a client's friend opens to ask for a quote (/r/:token). */
export function Referral() {
  const { token = '' } = useParams();
  const [page, setPage] = useState<ReferralPage | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('get_referral_page', { p_token: token }).then(({ data, error }) => {
      setPage(error ? null : ((data as ReferralPage | null) ?? null));
    });
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 7) return setError('Add a phone number so they can reach you.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('submit_referral', {
      p_token: token,
      p_name: name,
      p_phone: phone,
      p_project: project,
    });
    setBusy(false);
    if (error) {
      if (error.message === 'too_many') return setError('This link has had a lot of requests today. Try again tomorrow.');
      return setError('That didn’t go through. Check your details and try again.');
    }
    setSent(true);
  }

  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow">
        {page === undefined && <Loading />}
        {page === null && (
          <div className="card pad-card">
            <h1>This link doesn’t work</h1>
            <p>It may have been cut off. Ask the person who sent it to send it again.</p>
          </div>
        )}
        {page && sent && (
          <div className="card approved-banner" role="status">
            <h1>Sent. Thanks!</h1>
            <p>{page.business_name} will be in touch to talk about your project.</p>
          </div>
        )}
        {page && !sent && (
          <form onSubmit={submit} className="stack">
            <p className="from">{page.business_name}</p>
            <h1>
              {page.referrer_first_name ? `${page.referrer_first_name} sent you` : 'Get a quote'}
            </h1>
            <p className="muted">
              Tell {page.business_name} about your project and they’ll get back to you
              {page.referrer_first_name ? `. They’ll know ${page.referrer_first_name} sent you.` : '.'}
            </p>
            <label className="field">
              <span>Your name</span>
              <input autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Mobile number</span>
              <input type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="field">
              <span>What’s the project</span>
              <textarea rows={4} maxLength={1000} placeholder="Deck repair, about 12 by 16. Boards soft near the stairs." value={project} onChange={(e) => setProject(e.target.value)} />
            </label>
            <ErrorNote message={error} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Sending…' : `Send to ${page.business_name}`}
            </button>
            <p className="muted small center">Your details only go to {page.business_name}.</p>
          </form>
        )}
      </main>
    </>
  );
}
