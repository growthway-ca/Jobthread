import { describe, expect, it } from 'vitest';
import { paymentProgress } from './progress';

const base = { holdbackRate: 0, holdbackReleased: false };

describe('paymentProgress', () => {
  it('is paid in full only when the money covers the job', () => {
    const one = [{ status: 'paid', amount_cents: 940000 }];
    expect(paymentProgress({ ...base, subtotalCents: 940000, milestones: one }).label).toBe('Paid in full');
    const short = paymentProgress({ ...base, subtotalCents: 1200000, milestones: one });
    expect(short.fullyPaid).toBe(false);
    expect(short.label).toBe('$9,400 of $12,000 in');
    expect(short.fraction).toBeCloseTo(0.783, 2);
  });

  it('allows for a holdback not released yet', () => {
    const p = paymentProgress({
      subtotalCents: 1000000,
      holdbackRate: 0.1,
      holdbackReleased: false,
      milestones: [{ status: 'paid', amount_cents: 900000 }],
    });
    expect(p.fullyPaid).toBe(true);
    expect(p.label).toBe('Paid in full, holdback to come');
  });

  it('says when nothing is in or set up', () => {
    expect(paymentProgress({ ...base, subtotalCents: 500000, milestones: [] }).label).toBe('No payment schedule');
    expect(
      paymentProgress({ ...base, subtotalCents: 500000, milestones: [{ status: 'upcoming', amount_cents: 500000 }] }).label,
    ).toBe('No payments yet');
  });
});
