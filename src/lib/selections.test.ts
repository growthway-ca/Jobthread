import { describe, expect, it } from 'vitest';
import { groupSelections, selectionDetails, selectionsMessage } from './selections';

describe('selections', () => {
  it('lists the details that are filled in', () => {
    expect(selectionDetails({ brand: 'Benjamin Moore', code: 'OC-65', color: null, finish: 'Eggshell' })).toBe(
      'Benjamin Moore · OC-65 · Eggshell',
    );
    expect(selectionDetails({ brand: ' ', code: null, color: null, finish: null })).toBe('');
  });

  it('groups paint before flooring before other', () => {
    const groups = groupSelections([
      { category: 'other' as const },
      { category: 'paint' as const },
      { category: 'paint' as const },
    ]);
    expect(groups.map((g) => [g.id, g.items.length])).toEqual([
      ['paint', 2],
      ['other', 1],
    ]);
  });

  it('writes the confirm request', () => {
    expect(selectionsMessage({ clientName: 'Matt P.', jobTitle: 'Basement', count: 3, link: 'https://x/j/t' })).toBe(
      "Hi Matt, I've written down the 3 picks for your basement (paint colours, flooring and so on). Can you check them and tap Confirm so we're all on the same page? https://x/j/t",
    );
  });
});
