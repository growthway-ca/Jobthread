import { describe, expect, it } from 'vitest';
import { stageProgress, workAheadOfMoney } from './stages';

const s = (title: string, starts_on: string, done_on: string | null = null, utility: string | null = null) => ({
  title,
  starts_on,
  done_on,
  utility,
});

describe('stageProgress', () => {
  it('counts done stages in date order and skips shutoffs', () => {
    const p = stageProgress([
      s('Drywall', '2026-11-20'),
      s('Framing', '2026-11-01', '2026-11-05'),
      s('Water off', '2026-11-08', null, 'water'),
      s('Rough-ins', '2026-11-10'),
    ]);
    expect(p.stages.map((x) => x.title)).toEqual(['Framing', 'Rough-ins', 'Drywall']);
    expect(p.label).toBe('1 of 3 stages · Now: Rough-ins');
    expect(p.fraction).toBeCloseTo(1 / 3);
  });

  it('says when the work is done, or when there are no stages', () => {
    expect(stageProgress([s('Stairs', '2026-11-01', '2026-11-03')]).label).toBe('1 of 1 stages · Work done');
    expect(stageProgress([s('Water off', '2026-11-01', null, 'water')]).label).toBe('No stages');
  });
});

describe('workAheadOfMoney', () => {
  it('flags work well ahead of payments', () => {
    expect(workAheadOfMoney(1, 0.05, true)).toBe(true);
    expect(workAheadOfMoney(0.4, 0.25, true)).toBe(false);
    expect(workAheadOfMoney(0, 0, false)).toBe(false);
  });
});
