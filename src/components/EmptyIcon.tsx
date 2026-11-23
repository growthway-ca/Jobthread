/** Outline icons for empty states and info cards. */
export function EmptyIcon({ name }: { name: 'calendar' | 'shield' | 'people' | 'star' }) {
  const common = {
    width: 32,
    height: 32,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'empty-icon',
  };
  switch (name) {
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4M12 12v6M13.5 13.2c-.4-.4-.9-.6-1.5-.6-.9 0-1.5.5-1.5 1.1 0 1.5 3 .8 3 2.4 0 .6-.6 1.1-1.5 1.1-.6 0-1.2-.3-1.6-.7" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'people':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6 1.6 0 3 .6 4.1 1.6" />
          <circle cx="17.5" cy="7.5" r="2" />
          <circle cx="17.5" cy="17.5" r="2" />
          <path d="M15.6 8.4 12.4 16" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />
        </svg>
      );
  }
}
