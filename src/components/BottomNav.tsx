import { NavLink, useLocation } from 'react-router-dom';

function Icon({ name }: { name: 'jobs' | 'quotes' | 'money' }) {
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
  if (name === 'jobs') {
    return (
      <svg {...common}>
        <path d="M4 11 12 4l8 7v9H4z" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }
  if (name === 'quotes') {
    return (
      <svg {...common}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M9 12h7M9 16h7M9 8h4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();
  const items = [
    { to: '/', label: 'Jobs', icon: 'jobs' as const, end: true },
    { to: '/quotes', label: 'Quotes', icon: 'quotes' as const, end: false },
    { to: '/money', label: 'Money', icon: 'money' as const, end: false },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => {
            // Job screens count as "Jobs".
            const jobs = item.to === '/' && pathname.startsWith('/jobs');
            return isActive || jobs ? 'nav-item active' : 'nav-item';
          }}
        >
          <span className="nav-pill">
            <Icon name={item.icon} />
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
