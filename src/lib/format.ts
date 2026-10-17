const dateTime = new Intl.DateTimeFormat('en-CA', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateTimeYear = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** formatWhen() for the end of a sentence: no doubled full stop after "p.m.". */
export function formatWhenSentence(iso: string | null): string {
  const text = formatWhen(iso);
  return text.endsWith('.') ? text : `${text}.`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return (d.getFullYear() === new Date().getFullYear() ? dateTime : dateTimeYear).format(d);
}

/** Turns a Supabase/Postgres error into something a person can read. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (/failed to fetch|network/i.test(msg)) return 'No connection. Check your signal and try again.';
    if (/rate limit/i.test(msg)) return 'Too many sign-in emails were sent in the last hour. Wait a bit and try again.';
    if (/permission denied|row-level security/i.test(msg)) return "You don't have access to that.";
    return msg;
  }
  return 'Something went wrong. Try again.';
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** "Mon, Oct 20" or "Oct 20 – 22" for a date range. */
export function formatDateRange(start: string, end?: string | null): string {
  const fmt = (iso: string, withDay: boolean) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
      weekday: withDay ? 'short' : undefined,
      month: 'short',
      day: 'numeric',
    });
  if (!end || end === start) return fmt(start, true);
  return `${fmt(start, false)} – ${fmt(end, false)}`;
}

export function daysAgo(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
}
