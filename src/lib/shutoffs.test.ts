import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeRange, shutoffMessage, shutoffTitle } from './shutoffs';

describe('shutoff times', () => {
  it('formats times the Canadian way', () => {
    expect(formatTime('09:00:00')).toBe('9 a.m.');
    expect(formatTime('13:30')).toBe('1:30 p.m.');
    expect(formatTime('00:15')).toBe('12:15 a.m.');
  });
  it('shares a.m./p.m. when both ends match', () => {
    expect(formatTimeRange('09:00:00', '11:00:00')).toBe('9 to 11 a.m.');
    expect(formatTimeRange('11:00', '13:00')).toBe('11 a.m. to 1 p.m.');
    expect(formatTimeRange('09:00', null)).toBe('from 9 a.m.');
    expect(formatTimeRange(null, null)).toBe('');
  });
});

describe('shutoffMessage', () => {
  it('writes a short heads-up', () => {
    expect(shutoffMessage({ clientName: 'Matt P.', utility: 'water', when: 'Tue, Oct 27, 9 to 11 a.m.', note: 'Vanity swap.' })).toBe(
      "Hi Matt, heads up: the water will be off Tue, Oct 27, 9 to 11 a.m. for the vanity swap. We'll have it back on as soon as we can.",
    );
  });
  it('works without a reason', () => {
    expect(shutoffMessage({ clientName: '', utility: 'power', when: 'Mon, Nov 2', note: null })).toBe(
      "Hi, heads up: the power will be off Mon, Nov 2. We'll have it back on as soon as we can.",
    );
  });
});

describe('shutoffTitle', () => {
  it('drops a title that only repeats the pill', () => {
    expect(shutoffTitle('Water off', 'water')).toBe('');
    expect(shutoffTitle('Panel swap', 'power')).toBe('Panel swap');
  });
});
