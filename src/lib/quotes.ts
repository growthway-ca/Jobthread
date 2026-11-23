import type { OptionKind } from './types';

/** The parts of an option the price and picking logic need. */
export interface PickableOption {
  id: string;
  kind: OptionKind;
  group_name?: string | null;
  price_cents: number;
  recommended: boolean;
  selected?: boolean | null;
}

/** Choice groups in the order their first option appears: [{ name: 'Frame', options: [...] }]. */
export function choiceGroups<T extends PickableOption>(options: T[]): { name: string; options: T[] }[] {
  const groups: { name: string; options: T[] }[] = [];
  for (const o of options) {
    if (o.kind !== 'choice' || !o.group_name) continue;
    const group = groups.find((g) => g.name === o.group_name);
    if (group) group.options.push(o);
    else groups.push({ name: o.group_name, options: [o] });
  }
  return groups;
}

/**
 * What's picked when the page opens: the client's picks once they've signed,
 * otherwise what the contractor ticked to start, with one pick in every choice
 * group and at most one package.
 */
export function startingPicks(options: PickableOption[], signed: boolean): Set<string> {
  if (signed) return new Set(options.filter((o) => o.selected).map((o) => o.id));
  const picked = new Set(options.filter((o) => o.recommended && o.kind === 'addon').map((o) => o.id));
  const packages = options.filter((o) => o.kind === 'package');
  const pkg = packages.find((o) => o.recommended) ?? packages[0];
  if (pkg) picked.add(pkg.id);
  for (const g of choiceGroups(options)) picked.add((g.options.find((o) => o.recommended) ?? g.options[0]).id);
  return picked;
}

/** Tapping an option: add-ons toggle; a package or a choice replaces the others in its set. */
export function tapOption(picked: Set<string>, options: PickableOption[], id: string): Set<string> {
  const option = options.find((o) => o.id === id);
  if (!option) return picked;
  const next = new Set(picked);
  if (option.kind === 'addon') {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  const rivals = options.filter((o) =>
    option.kind === 'package' ? o.kind === 'package' : o.kind === 'choice' && o.group_name === option.group_name,
  );
  for (const r of rivals) next.delete(r.id);
  next.add(id);
  return next;
}

export function pickedSubtotal(baseCents: number, options: PickableOption[], picked: Set<string>): number {
  return baseCents + options.filter((o) => picked.has(o.id)).reduce((t, o) => t + o.price_cents, 0);
}

/** "+$160", "−$70" or "Included". */
export function priceTag(cents: number, format: (c: number) => string): string {
  if (cents === 0) return 'Included';
  return cents > 0 ? `+${format(cents)}` : `−${format(-cents)}`;
}

// ---------------------------------------------------------------- signature

/** The signature box, in SVG units. */
export const SIGNATURE_BOX = { width: 300, height: 100 };

/**
 * Finger strokes (in the box's units) as compact SVG path data:
 * "M 12.5 40 L 13 41.5 ...". A single tap becomes a dot.
 */
export function strokesToPath(strokes: { x: number; y: number }[][]): string {
  const n = (v: number) => {
    const rounded = Math.round(v * 10) / 10;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  };
  return strokes
    .filter((s) => s.length > 0)
    .map((s) => {
      const pts = s.length === 1 ? [s[0], { x: s[0].x + 0.5, y: s[0].y + 0.5 }] : s;
      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${n(p.x)} ${n(p.y)}`).join(' ');
    })
    .join(' ');
}

/** Whether a drawing is enough to count as a signature, not a stray tap. */
export function isRealSignature(strokes: { x: number; y: number }[][]): boolean {
  const points = strokes.flat();
  if (points.length < 6) return false;
  const xs = points.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs) >= 30;
}
