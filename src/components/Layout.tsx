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
        <Link to="/settings" className="header-btn">
          Settings
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
