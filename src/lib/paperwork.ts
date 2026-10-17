import { todayIso, addDaysIso } from './format';

const DAY = 24 * 60 * 60 * 1000;

export interface PaperworkStatus {
  level: 'ok' | 'soon' | 'expired' | 'missing';
  text: string;
  /** What to ask the sub for, e.g. ["WSIB clearance", "insurance certificate"]. */
  ask: string[];
}

function daysUntil(iso: string): number {
  return Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(todayIso() + 'T12:00:00').getTime()) / DAY);
}

/** Where a sub's WSIB clearance and insurance stand. "Soon" means within 30 days. */
export function paperworkStatus(s: { wsib_expires_on: string | null; insurance_expires_on: string | null }): PaperworkStatus {
  const soonCutoff = addDaysIso(todayIso(), 30);
  const parts: string[] = [];
  const ask: string[] = [];
  let level: PaperworkStatus['level'] = 'ok';

  const check = (label: string, askAs: string, date: string | null) => {
    if (!date) {
      parts.push(`No ${label} date`);
      if (level === 'ok') level = 'missing';
      return;
    }
    const days = daysUntil(date);
    if (days < 0) {
      parts.push(`${label} expired ${-days} day${days === -1 ? '' : 's'} ago`);
      ask.push(askAs);
      level = 'expired';
    } else if (date <= soonCutoff) {
      parts.push(`${label} expires in ${days} day${days === 1 ? '' : 's'}`);
      ask.push(askAs);
      if (level !== 'expired') level = 'soon';
    }
  };
  check('WSIB clearance', 'WSIB clearance certificate', s.wsib_expires_on);
  check('Insurance', 'insurance certificate', s.insurance_expires_on);

  return { level, text: parts.length ? parts.join(' · ') : 'WSIB and insurance on file', ask };
}
