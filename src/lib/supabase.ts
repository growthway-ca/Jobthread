import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Supabase's default email (until custom SMTP is set up) sends a sign-in
    // link, not a code. The implicit flow lets that link sign in from
    // whichever browser the phone's email app opens it in.
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

/** Base URL used in approval links sent to clients. */
export function publicBaseUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  return (configured || window.location.origin).replace(/\/+$/, '');
}

export function approvalLink(token: string): string {
  return `${publicBaseUrl()}/a/${token}`;
}

/** A client's referral link for friends. */
export function referralLink(token: string): string {
  return `${publicBaseUrl()}/r/${token}`;
}

/** The client's project page for a job. */
export function projectLink(token: string): string {
  return `${publicBaseUrl()}/j/${token}`;
}
