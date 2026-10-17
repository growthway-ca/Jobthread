import { formatMoney } from './money';

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Keeps digits and a leading +, which is all an sms: link needs. */
export function smsNumber(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

/**
 * iOS wants sms:NUMBER&body=..., Android wants sms:NUMBER?body=...
 */
export function smsHref(phone: string, body?: string): string {
  const base = `sms:${smsNumber(phone)}`;
  if (!body) return base;
  return `${base}${isIOS() ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function stripEndPunctuation(text: string): string {
  return text.trim().replace(/[.!\s]+$/, '');
}

/** "Half a day" reads better mid-sentence as "half a day"; leave "HVAC" alone. */
export function midSentence(text: string): string {
  const t = text.trim();
  if (t.length > 1 && /^[A-Z][a-z]/.test(t)) return t[0].toLowerCase() + t.slice(1);
  return t;
}

/** Time-added value the schedule chips use when the change adds no time. */
export const NO_SCHEDULE_CHANGE = 'No change';

export function isNoScheduleChange(timeAdded: string | null | undefined): boolean {
  return /^no change\b/i.test(timeAdded?.trim() ?? '');
}

/** "adds half a day", "no change to the schedule", or '' when blank. */
export function scheduleClause(timeAdded: string | null | undefined): string {
  if (!timeAdded?.trim()) return '';
  if (isNoScheduleChange(timeAdded)) return 'no change to the schedule';
  return `adds ${midSentence(stripEndPunctuation(timeAdded))}`;
}

export interface ChangeMessageInput {
  clientName: string;
  number: number;
  jobTitle: string;
  description: string;
  priceCents: number;
  timeAdded: string | null;
  link: string;
}

export function changeMessage(m: ChangeMessageInput): string {
  const hi = firstName(m.clientName) ? `Hi ${firstName(m.clientName)}, ` : 'Hi, ';
  const schedule = scheduleClause(m.timeAdded);
  const time = schedule ? `, ${schedule}` : '';
  return (
    `${hi}change #${m.number} for your ${m.jobTitle.trim()}: ${stripEndPunctuation(m.description)}. ` +
    `${formatMoney(m.priceCents)} + HST${time}. Approve here: ${m.link}`
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or no clipboard permission: fall back to a selection.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

const shortDate = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });

export function dailyLogMessage(m: { clientName: string; jobTitle: string; body: string; when: Date }): string {
  const hi = firstName(m.clientName) ? `Hi ${firstName(m.clientName)}, ` : '';
  return `${hi}update on your ${m.jobTitle.trim()}, ${shortDate.format(m.when)}: ${m.body.trim()}`;
}

export function paymentRequestMessage(m: {
  clientName: string;
  jobTitle: string;
  title: string;
  amountCents: number;
  taxRate: number;
  etransferEmail: string | null;
}): string {
  const hi = firstName(m.clientName) ? `Hi ${firstName(m.clientName)}, ` : 'Hi, ';
  const tax = Math.round(m.amountCents * Number(m.taxRate));
  const how = m.etransferEmail?.trim() ? ` You can e-Transfer it to ${m.etransferEmail.trim()}.` : '';
  return (
    `${hi}a payment is due for your ${m.jobTitle.trim()}: ${stripEndPunctuation(m.title)}. ` +
    `${formatMoney(m.amountCents)} + HST = ${formatMoney(m.amountCents + tax, { alwaysCents: true })}.${how} Thank you!`
  );
}

export function quoteMessage(m: {
  clientName: string;
  businessName: string;
  title: string;
  baseCents: number;
  hasOptions: boolean;
  link: string;
}): string {
  const hi = firstName(m.clientName) ? `Hi ${firstName(m.clientName)}, ` : 'Hi, ';
  const options = m.hasOptions ? ', with options you can choose from' : '';
  return (
    `${hi}here's your quote from ${m.businessName.trim()} for your ${m.title.trim()}: ` +
    `${formatMoney(m.baseCents)} + HST${options}. See it and accept here: ${m.link}`
  );
}
