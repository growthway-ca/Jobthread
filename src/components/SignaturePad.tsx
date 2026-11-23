import { useRef, useState, type PointerEvent } from 'react';
import { SIGNATURE_BOX, strokesToPath } from '../lib/quotes';

type Point = { x: number; y: number };

/** Sign with a finger. Reports the strokes in the 300 x 100 signature box. */
export function SignaturePad({ onChange, disabled }: { onChange: (strokes: Point[][]) => void; disabled?: boolean }) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const drawing = useRef(false);
  const svg = useRef<SVGSVGElement>(null);

  function point(e: PointerEvent<SVGSVGElement>): Point {
    const box = svg.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * SIGNATURE_BOX.width,
      y: ((e.clientY - box.top) / box.height) * SIGNATURE_BOX.height,
    };
  }

  function update(next: Point[][]) {
    setStrokes(next);
    onChange(next);
  }

  function down(e: PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    update([...strokes, [point(e)]]);
  }

  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const p = point(e);
    const last = strokes[strokes.length - 1];
    const prev = last[last.length - 1];
    // Skip tiny moves to keep the path short.
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1.2) return;
    update([...strokes.slice(0, -1), [...last, p]]);
  }

  function up() {
    drawing.current = false;
  }

  return (
    <div className="signature-pad">
      <svg
        ref={svg}
        viewBox={`0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`}
        role="img"
        aria-label={strokes.length ? 'Your signature' : 'Sign here with your finger'}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <line x1="12" x2="288" y1="82" y2="82" className="signature-line" />
        {strokes.length === 0 && (
          <text x="150" y="56" textAnchor="middle" className="signature-hint">
            Sign here with your finger
          </text>
        )}
        <path d={strokesToPath(strokes)} className="signature-ink" />
      </svg>
      {strokes.length > 0 && !disabled && (
        <button type="button" className="btn small plain" onClick={() => update([])}>
          Clear
        </button>
      )}
    </div>
  );
}

/** A saved signature, drawn back from its path data. */
export function SignatureView({ path, label }: { path: string; label?: string }) {
  return (
    <svg
      className="signature-view"
      viewBox={`0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`}
      role="img"
      aria-label={label ?? 'Signature'}
    >
      <line x1="12" x2="288" y1="82" y2="82" className="signature-line" />
      <path d={path} className="signature-ink" />
    </svg>
  );
}
