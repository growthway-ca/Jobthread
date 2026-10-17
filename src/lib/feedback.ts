/** Where pilot feedback goes. Override with VITE_FEEDBACK_EMAIL. */
export const FEEDBACK_EMAIL: string = import.meta.env.VITE_FEEDBACK_EMAIL || 'hello@jobthread.ca';

/** A mailto: link with the screen and phone filled in, so reports say where things went wrong. */
export function feedbackHref({ businessName, detail }: { businessName?: string; detail?: string } = {}): string {
  const lines = [
    '',
    '',
    '---',
    `From: ${businessName || 'a JobThread user'}`,
    `Screen: ${window.location.pathname}`,
    `Phone: ${navigator.userAgent}`,
    ...(detail ? [`Error: ${detail}`] : []),
  ];
  const subject = detail ? 'JobThread problem' : 'JobThread feedback';
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
