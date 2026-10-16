export function Mark({ color = '#FFFFFF', size = 28 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="-46 -39 92 92" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M -30 35 V -5 L 0 -35 L 16 -19 V -30 H 24 V -11 L 30 -5 V 35 H 22 V 50 L 8 35 Z"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
