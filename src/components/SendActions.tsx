import { useState, type ReactNode } from 'react';
import { copyText, smsHref } from '../lib/sms';

/** "Open Messages" plus the copy fallback, for one prewritten text. */
export function SendActions({
  phone,
  message,
  label = 'Open Messages',
  compact = false,
  children,
}: {
  phone: string;
  message: string;
  label?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  async function copy() {
    const ok = await copyText(message);
    setCopied(ok ? 'ok' : 'fail');
    if (ok) setTimeout(() => setCopied('idle'), 2500);
  }

  return (
    <div className={compact ? 'row-actions' : 'stack'}>
      <a href={smsHref(phone, message)} className={compact ? 'btn small' : 'btn primary'}>
        {label}
      </a>
      <button type="button" className={compact ? 'btn small plain' : 'btn secondary'} onClick={() => void copy()}>
        {copied === 'ok' ? 'Copied' : 'Copy text'}
      </button>
      {children}
      {copied === 'fail' && (
        <p className="muted small full">
          {compact
            ? 'Couldn’t copy on this phone. Use Resend instead.'
            : 'Couldn’t copy on this phone. Press and hold the text above to copy it.'}
        </p>
      )}
    </div>
  );
}
