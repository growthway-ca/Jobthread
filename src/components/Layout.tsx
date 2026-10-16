import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from './Mark';

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

export function Page({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <>
      {header ?? <Header />}
      <main className="page">{children}</main>
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
