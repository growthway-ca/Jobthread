import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { ErrorNote } from '../components/Layout';
import { AuthShell } from '../components/AuthShell';

const RESEND_AFTER = 30; // seconds before "Send it again" unlocks

export function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Trailing slash so Supabase's "https://host/**" redirect patterns match.
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setStep('code');
    setWait(RESEND_AFTER);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.replace(/\s/g, ''),
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setError(/expired|invalid/i.test(error.message) ? 'That code didn’t work. Check it, or send a new one.' : errorMessage(error));
    }
    // On success the auth listener picks up the session and the app moves on.
  }

  if (step === 'code') {
    return (
      <AuthShell hero={false}>
        <div className="auth-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <h2 className="auth-title">Check your email</h2>
        <p className="auth-sub">
          We sent a sign-in link to <strong>{email.trim()}</strong>. Tap it on this phone, or type the code from the email.
        </p>
        <form onSubmit={verify} className="stack">
          <label className="field">
            <span>Code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              required
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="code-input"
            />
          </label>
          <ErrorNote message={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>
        <div className="auth-links">
          <button type="button" className="link-btn" disabled={busy || wait > 0} onClick={() => void send()}>
            {wait > 0 ? `Send it again in ${wait}s` : 'Send it again'}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
        <p className="auth-fine">Not there? Check spam or promotions. It comes from JobThread.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2 className="auth-title">Sign in or get started</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="stack"
      >
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@yourcompany.ca"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Sending…' : 'Continue with email'}
        </button>
      </form>
      <p className="auth-fine">No password. We’ll email you a link to sign in.</p>
      <p className="auth-fine">
        By continuing you agree to the <a href="https://jobthread.ca/terms">Terms</a> and{' '}
        <a href="https://jobthread.ca/privacy">Privacy Policy</a>.
      </p>
    </AuthShell>
  );
}
