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
