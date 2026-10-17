/** Parses what a person types ("1,250", "$850.50", "-400") into cents. */
export function parseDollars(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, '');
  if (!/^-?(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [whole, frac = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_00) return null;
  return negative ? -cents : cents;
}

/** "$1,250" for whole dollars, "$1,250.50" otherwise, "-$400" for credits. */
export function formatMoney(cents: number, opts: { alwaysCents?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const showCents = opts.alwaysCents || abs % 100 !== 0;
  const text = (abs / 100).toLocaleString('en-CA', {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  return `${cents < 0 ? '-' : ''}$${text}`;
}

export function taxCents(cents: number, rate: number): number {
  return Math.round(cents * Number(rate));
}

export interface JobTotals {
  contractCents: number;
  approvedCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  pendingCents: number;
}

export function jobTotals(
  contractCents: number,
  taxRate: number,
  changes: { status: string; price_cents: number }[],
): JobTotals {
  const approvedCents = changes
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.price_cents, 0);
  const pendingCents = changes
    .filter((c) => c.status === 'sent')
    .reduce((sum, c) => sum + c.price_cents, 0);
  const subtotalCents = contractCents + approvedCents;
  const tax = taxCents(subtotalCents, taxRate);
  return {
    contractCents,
    approvedCents,
    subtotalCents,
    taxCents: tax,
    totalCents: subtotalCents + tax,
    pendingCents,
  };
}

export function taxLabel(rate: number): string {
  // v1 is Ontario-only; the brief calls the tax HST throughout.
  return `HST (${Math.round(Number(rate) * 1000) / 10}%)`;
}

export interface PaymentTotals {
  scheduledCents: number;
  paidCents: number;
  requestedCents: number;
  /** Job subtotal (before HST) minus what's been paid. */
  leftCents: number;
  /** Job subtotal not yet covered by a scheduled payment. */
  unscheduledCents: number;
}

export function paymentTotals(
  subtotalCents: number,
  milestones: { status: string; amount_cents: number }[],
): PaymentTotals {
  const sum = (status?: string) =>
    milestones.filter((m) => !status || m.status === status).reduce((t, m) => t + m.amount_cents, 0);
  const scheduledCents = sum();
  const paidCents = sum('paid');
  return {
    scheduledCents,
    paidCents,
    requestedCents: sum('requested'),
    leftCents: subtotalCents - paidCents,
    unscheduledCents: subtotalCents - scheduledCents,
  };
}

export function holdbackCents(subtotalCents: number, rate: number): number {
  return Math.round(subtotalCents * Number(rate));
}
