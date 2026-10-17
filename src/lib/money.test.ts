import { describe, expect, it } from 'vitest';
import { formatMoney, jobTotals, parseDollars, paymentTotals } from './money';

describe('parseDollars', () => {
  it.each([
    ['850', 85000],
    ['1,250.50', 125050],
    ['$1250.5', 125050],
    ['.99', 99],
    ['-400', -40000],
    [' 25 000 ', 2500000],
  ])('%s -> %i cents', (input, cents) => {
    expect(parseDollars(input)).toBe(cents);
  });

  it.each(['', 'abc', '1.234', '1-2', '--5'])('rejects %j', (input) => {
    expect(parseDollars(input)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('drops cents on whole dollars unless asked', () => {
    expect(formatMoney(85000)).toBe('$850');
    expect(formatMoney(125050)).toBe('$1,250.50');
    expect(formatMoney(85000, { alwaysCents: true })).toBe('$850.00');
    expect(formatMoney(-40000)).toBe('-$400');
  });
});

describe('jobTotals', () => {
  it('counts approved changes only and adds tax on the subtotal', () => {
    const t = jobTotals(2500000, 0.13, [
      { status: 'approved', price_cents: 85000 },
      { status: 'sent', price_cents: 120000 },
      { status: 'void', price_cents: 99999 },
    ]);
    expect(t.subtotalCents).toBe(2585000);
    expect(t.taxCents).toBe(336050);
    expect(t.totalCents).toBe(2921050);
    expect(t.pendingCents).toBe(120000);
  });
});

describe('paymentTotals', () => {
  it('splits paid, requested and what is left', () => {
    const t = paymentTotals(8000000, [
      { status: 'paid', amount_cents: 1000000 },
      { status: 'requested', amount_cents: 2000000 },
      { status: 'upcoming', amount_cents: 3000000 },
    ]);
    expect(t).toEqual({
      scheduledCents: 6000000,
      paidCents: 1000000,
      requestedCents: 2000000,
      leftCents: 7000000,
      unscheduledCents: 2000000,
    });
  });
});
