import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from './Mark';
import { BottomNav } from './BottomNav';

export function Header({ right, linkHome = true }: { right?: ReactNode; linkHome?: boolean }) {
  const brand = (
    <>
      <Mark />
      <span className="wordmark">JobThread</span>
    </>
  );
  return (
    <header className="app-header">
      {linkHome ? (
        <Link to="/" className="brand">
          {brand}
        </Link>
      ) : (
        <span className="brand">{brand}</span>
      )}
      {right && <div className="header-right">{right}</div>}
    </header>
  );
}

/** Header for signed-in contractor screens. */
export function AppHeader() {
  return (
    <Header
      right={
        <Link to="/settings" className="header-icon" aria-label="Settings" title="Settings">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      }
    />
  );
}

/**
 * A contractor screen: header, content, and the bottom tabs unless `nav` is
 * false (forms keep the screen to themselves).
 */
export function Page({ children, header, nav = true }: { children: ReactNode; header?: ReactNode; nav?: boolean }) {
  return (
    <>
      {header ?? <AppHeader />}
      <main className={nav ? 'page with-nav' : 'page'}>{children}</main>
      {nav && <BottomNav />}
    </>
  );
}

export function Loading() {
  return <p className="muted center pad">Loading…</p>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}
