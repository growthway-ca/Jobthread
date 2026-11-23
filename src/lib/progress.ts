import { formatMoney, holdbackCents } from './money';

export interface PaymentProgress {
  /** What the client owes before HST, less any holdback not released yet. */
  targetCents: number;
  paidCents: number;
  /** 0 to 1, for the bar. */
  fraction: number;
  fullyPaid: boolean;
  hasSchedule: boolean;
  /** "Paid in full", "$9,400 of $12,000 in", "No payments yet" or "No payment schedule". */
  label: string;
}

/**
 * How much of a job is paid. "Paid in full" means the money in covers the
 * job, not just that every scheduled payment is in: a schedule can cover
 * less than the contract.
 */
export function paymentProgress(job: {
  subtotalCents: number;
  holdbackRate: number;
  holdbackReleased: boolean;
  milestones: { status: string; amount_cents: number }[];
}): PaymentProgress {
  const held = job.holdbackReleased ? 0 : holdbackCents(job.subtotalCents, job.holdbackRate);
  const targetCents = Math.max(0, job.subtotalCents - held);
  const paidCents = job.milestones.filter((m) => m.status === 'paid').reduce((t, m) => t + m.amount_cents, 0);
  const hasSchedule = job.milestones.length > 0;
  const fullyPaid = targetCents > 0 && paidCents >= targetCents;
  const fraction = targetCents > 0 ? Math.min(1, paidCents / targetCents) : 0;
  const label = fullyPaid
    ? held > 0
      ? 'Paid in full, holdback to come'
      : 'Paid in full'
    : paidCents > 0
      ? `${formatMoney(paidCents)} of ${formatMoney(targetCents)} in`
      : hasSchedule
        ? 'No payments yet'
        : 'No payment schedule';
  return { targetCents, paidCents, fraction, fullyPaid, hasSchedule, label };
}
