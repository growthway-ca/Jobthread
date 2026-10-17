/** The JobThread mark: a handsaw whose blade is a text message. Paths match scripts/make-icons.mjs and landing/. */
export function Mark({ color = '#FFD21F', size = 28 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 240 124" width={(size * 240) / 124} height={size} aria-hidden="true" focusable="false">
      <g fill={color}>
        <path
          fillRule="evenodd"
          d="M66 8 V114 H38 Q4 114 4 80 V42 Q4 8 38 8 Z M51 27 V95 H38 Q21 95 21 78 V44 Q21 27 38 27 Z"
        />
        <path
          fillRule="evenodd"
          d="M64 18 L218 28 Q231 29 231 42 V80 Q231 93 218 93 H102 L76 118 L80 93 H64 Z M79 29.3 L215 38.6 Q220 39 220 44 V77 Q220 82 215 82 H79 Q75 82 75 78 V33 Q75 29 79 29.3 Z"
        />
        <rect x="84" y="42" width="120" height="9" rx="4.5" />
        <rect x="84" y="55" width="120" height="9" rx="4.5" />
        <rect x="84" y="68" width="66" height="9" rx="4.5" />
        <path d="M104 92 l5 15 l14 -15 Z M123 92 l5 15 l14 -15 Z M142 92 l5 15 l14 -15 Z M161 92 l5 15 l14 -15 Z M180 92 l5 15 l14 -15 Z M199 92 l5 15 l14 -15 Z" />
      </g>
    </svg>
  );
}
