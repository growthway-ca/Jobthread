import { describe, expect, it } from 'vitest';
import { choiceGroups, isRealSignature, pickedSubtotal, priceTag, startingPicks, strokesToPath, tapOption } from './quotes';
import type { PickableOption } from './quotes';

const opts: PickableOption[] = [
  { id: 'alu', kind: 'choice', group_name: 'Frame', price_cents: 0, recommended: false },
  { id: 'pvc', kind: 'choice', group_name: 'Frame', price_cents: 16000, recommended: false },
  { id: 'grey', kind: 'choice', group_name: 'Colour', price_cents: 0, recommended: true },
  { id: 'white', kind: 'choice', group_name: 'Colour', price_cents: 7000, recommended: false },
  { id: 'shutter', kind: 'addon', price_cents: 29000, recommended: true },
  { id: 'screen', kind: 'addon', price_cents: 7000, recommended: false },
];

describe('picking', () => {
  it('groups choices in order', () => {
    expect(choiceGroups(opts).map((g) => [g.name, g.options.map((o) => o.id)])).toEqual([
      ['Frame', ['alu', 'pvc']],
      ['Colour', ['grey', 'white']],
    ]);
  });

  it('starts with one pick per group, the first if none is marked', () => {
    expect([...startingPicks(opts, false)].sort()).toEqual(['alu', 'grey', 'shutter']);
  });

  it('starts with the client picks once signed', () => {
    const signed = opts.map((o) => ({ ...o, selected: o.id === 'pvc' || o.id === 'white' }));
    expect([...startingPicks(signed, true)].sort()).toEqual(['pvc', 'white']);
  });

  it('swaps within a group and toggles add-ons', () => {
    let picked = startingPicks(opts, false);
    picked = tapOption(picked, opts, 'pvc');
    picked = tapOption(picked, opts, 'shutter');
    picked = tapOption(picked, opts, 'screen');
    expect([...picked].sort()).toEqual(['grey', 'pvc', 'screen']);
    expect(pickedSubtotal(82000, opts, picked)).toBe(82000 + 16000 + 7000);
  });

  it('labels price differences', () => {
    const f = (c: number) => `$${c / 100}`;
    expect(priceTag(0, f)).toBe('Included');
    expect(priceTag(16000, f)).toBe('+$160');
    expect(priceTag(-7000, f)).toBe('−$70');
  });
});

describe('signature', () => {
  it('turns strokes into compact path data', () => {
    expect(
      strokesToPath([
        [
          { x: 10.04, y: 60 },
          { x: 20.26, y: 55.55 },
        ],
        [{ x: 5, y: 5 }],
      ]),
    ).toBe('M 10 60 L 20.3 55.6 M 5 5 L 5.5 5.5');
  });

  it('ignores a stray tap', () => {
    expect(isRealSignature([[{ x: 1, y: 1 }]])).toBe(false);
    const line = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 50 }));
    expect(isRealSignature([line])).toBe(true);
  });
});
