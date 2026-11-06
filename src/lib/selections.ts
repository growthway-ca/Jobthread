import { firstName, midSentence } from './sms';
import type { PublicSelection, SelectionCategory } from './types';

export const CATEGORIES: { id: SelectionCategory; label: string; plural: string }[] = [
  { id: 'paint', label: 'Paint', plural: 'Paint' },
  { id: 'flooring', label: 'Flooring', plural: 'Flooring' },
  { id: 'tile', label: 'Tile', plural: 'Tile' },
  { id: 'other', label: 'Other', plural: 'Other picks' },
];

export const PAINT_FINISHES = ['Flat', 'Matte', 'Eggshell', 'Pearl', 'Satin', 'Semi-gloss', 'Gloss'];

export const TILE_PATTERNS = ['Straight', 'Offset 1/2', 'Offset 1/3', 'Stacked vertical', 'Herringbone', 'Diagonal'];

export const categoryLabel = (c: SelectionCategory) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

/** "Benjamin Moore · OC-65 · Eggshell": what it is, minus the name, the layout and where it goes. */
export function selectionDetails(s: Pick<PublicSelection, 'brand' | 'code' | 'color' | 'finish' | 'size'>): string {
  return [s.brand, s.code, s.color, s.finish, s.size].filter((x) => x && x.trim()).join(' · ');
}

/** Tile layout: "Offset 1/3 · Grout: Mapei Warm Grey #09". */
export function tileLayout(s: Pick<PublicSelection, 'pattern' | 'grout'>): string {
  return [s.pattern?.trim(), s.grout?.trim() && `Grout: ${s.grout.trim()}`].filter(Boolean).join(' · ');
}

/** Groups picks by category, in the order the categories are listed. */
export function groupSelections<T extends { category: SelectionCategory }>(items: T[]) {
  return CATEGORIES.map((c) => ({ ...c, items: items.filter((s) => s.category === c.id) })).filter(
    (g) => g.items.length > 0,
  );
}

/** The text asking the client to check the picks on their page. */
export function selectionsMessage(m: { clientName: string; jobTitle: string; count: number; link: string }): string {
  const hi = firstName(m.clientName) ? `Hi ${firstName(m.clientName)}, ` : 'Hi, ';
  const what = m.count === 1 ? 'the pick' : `the ${m.count} picks`;
  return `${hi}I've written down ${what} for your ${midSentence(m.jobTitle)} (paint colours, flooring, tile and so on). Can you check them and tap Confirm so we're all on the same page? ${m.link}`;
}
