import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { ErrorNote, Header } from '../components/Layout';

export function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setStep('code');
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

  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow">
        <h1>Sign in</h1>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="stack">
            <p className="muted">We’ll email you a code. No password needed.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <ErrorNote message={error} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p className="muted">
              Enter the code we sent to <strong>{email}</strong>.
            </p>
            <label className="field">
              <span>Code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,12}"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="code-input"
              />
            </label>
            <ErrorNote message={error} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn plain"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </main>
    </>
  );
}
