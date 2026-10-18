import { Component, type ReactNode } from 'react';
import { feedbackHref } from '../lib/feedback';

/** Catches a crash on any screen and offers a reload instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="page narrow stack crash">
        <h1>Something went wrong</h1>
        <p className="muted">Reloading usually fixes it. Nothing you saved is lost.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <a className="btn plain" href={feedbackHref({ detail: error.message })}>
          Tell us what happened
        </a>
      </main>
    );
  }
}
