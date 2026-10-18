import { NavLink, useLocation } from 'react-router-dom';

type IconName = 'today' | 'quotes' | 'jobs' | 'money' | 'grow';

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'today':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
      );
    case 'quotes':
      return (
        <svg {...common}>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M9 12h7M9 16h7M9 8h4" />
        </svg>
      );
    case 'jobs':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <path d="M9 8V5h6v3M3 13h7m4 0h7M10 12h4v3h-4z" />
        </svg>
      );
    case 'money':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case 'grow':
      return (
        <svg {...common}>
          <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />
        </svg>
      );
  }
}

// Today sits in the middle as the main button.
const ITEMS: { to: string; label: string; icon: IconName; main?: boolean; match?: (path: string) => boolean }[] = [
  { to: '/jobs', label: 'Jobs', icon: 'jobs' },
  { to: '/quotes', label: 'Quotes', icon: 'quotes' },
  { to: '/', label: 'Today', icon: 'today', main: true, match: (p) => p === '/' },
  { to: '/money', label: 'Money', icon: 'money' },
  { to: '/grow', label: 'Grow', icon: 'grow' },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map((item) => {
        const active = item.match ? item.match(pathname) : pathname.startsWith(item.to);
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={`nav-item${item.main ? ' main' : ''}${active ? ' active' : ''}`}>
            <span className="nav-pill">
              <Icon name={item.icon} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
