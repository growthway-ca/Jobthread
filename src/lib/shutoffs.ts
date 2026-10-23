import { formatDateRange } from './format';
import { firstName } from './sms';

export type Utility = 'water' | 'power' | 'gas' | 'heat' | 'internet';

export const UTILITIES: { id: Utility; label: string }[] = [
  { id: 'water', label: 'Water' },
  { id: 'power', label: 'Power' },
  { id: 'gas', label: 'Gas' },
  { id: 'heat', label: 'Heat' },
  { id: 'internet', label: 'Internet' },
];

export const utilityLabel = (u: Utility) => UTILITIES.find((x) => x.id === u)?.label ?? u;

/** The title, unless it only repeats the "Water off" pill. */
export function shutoffTitle(title: string, utility: Utility): string {
  return title.trim().toLowerCase() === `${utilityLabel(utility)} off`.toLowerCase() ? '' : title;
}

/** A shutoff, as any of the schedule shapes carries it. */
export interface ShutoffLike {
  utility: Utility | null;
  starts_on: string;
  ends_on: string | null;
  from_time: string | null;
  to_time: string | null;
}

/** "09:00:00" → "9 a.m.", "13:30" → "1:30 p.m." */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h < 12 ? 'a.m.' : 'p.m.';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

/** "9 to 11 a.m.", "from 9 a.m.", "until 3 p.m.", or "" when there's no time. */
export function formatTimeRange(from: string | null, to: string | null): string {
  if (from && to) {
    const a = formatTime(from);
    const b = formatTime(to);
    const sameHalf = a.slice(-4) === b.slice(-4);
    return `${sameHalf ? a.slice(0, -5) : a} to ${b}`;
  }
  if (from) return `from ${formatTime(from)}`;
  if (to) return `until ${formatTime(to)}`;
  return '';
}

/** "Tue, Oct 27, 9 to 11 a.m." */
export function shutoffWhen(s: ShutoffLike): string {
  const time = formatTimeRange(s.from_time, s.to_time);
  return `${formatDateRange(s.starts_on, s.ends_on)}${time ? `, ${time}` : ''}`;
}

/** The heads-up text for the client, sent the day before. */
export function shutoffMessage(m: { clientName: string; utility: Utility; when: string; note: string | null }): string {
  const hi = firstName(m.clientName) ? `Hi ${firstName(m.clientName)}, ` : 'Hi, ';
  const why = m.note?.trim() ? ` for the ${m.note.trim().replace(/[.!]+$/, '').replace(/^./, (c) => c.toLowerCase())}` : '';
  return `${hi}heads up: the ${utilityLabel(m.utility).toLowerCase()} will be off ${m.when}${why}. We'll have it back on as soon as we can.`;
}
