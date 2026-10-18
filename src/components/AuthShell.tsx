import type { ReactNode } from 'react';
import { Mark } from './Mark';

/** The dark, full-screen frame for sign-in and first-time setup: brand on top, a white panel below. */
export function AuthShell({
  children,
  hero = true,
  topRight,
}: {
  children: ReactNode;
  /** The headline and sample approval. Off for the later steps, which only need the panel. */
  hero?: boolean;
  topRight?: ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth-glow" aria-hidden="true" />
      <header className="auth-top">
        <span className="auth-brand">
          <Mark size={30} />
          <span>JobThread</span>
        </span>
        {topRight}
      </header>
      {hero && (
        <section className="auth-hero">
          <h1>
            Every change, priced and <em>approved in writing.</em>
          </h1>
          <p>Send changes from your own number. Clients approve with one tap, no app, no login.</p>
          <SampleApproval />
        </section>
      )}
      <main className={hero ? 'auth-panel' : 'auth-panel auth-panel-solo'}>{children}</main>
    </div>
  );
}

/** A made-up approved change, to show what the app does before anyone signs in. */
function SampleApproval() {
  return (
    <div className="auth-sample" aria-hidden="true">
      <div className="auth-sample-row">
        <span className="auth-sample-tag">Change #4</span>
        <span className="auth-sample-price">$310 + HST</span>
      </div>
      <p className="auth-sample-title">Data ports at the office desk</p>
      <p className="auth-sample-ok">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5 9-10" />
        </svg>
        Approved by the client · 2:14 p.m.
      </p>
    </div>
  );
}
