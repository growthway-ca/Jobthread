/** The JobThread mark: a "j" whose dot is a speech bubble. Paths match scripts/make-icons.mjs. */
export function Mark({ color = '#FFFFFF', size = 32 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="22 8 56 87" width={(size * 56) / 87} height={size} aria-hidden="true" focusable="false">
      <path
        d="M 33 12 H 67 Q 73 12 73 18 V 30 Q 73 36 67 36 H 45 L 36 43 L 37 36 H 33 Q 27 36 27 30 V 18 Q 27 12 33 12 Z"
        fill={color}
      />
      <path d="M 54 45 V 71 Q 54 87 38 87 H 34" fill="none" stroke={color} strokeWidth="14" />
      <circle cx="34" cy="87" r="7" fill={color} />
    </svg>
  );
}
