import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Base URL used in approval links sent to clients. */
export function publicBaseUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  return (configured || window.location.origin).replace(/\/+$/, '');
}

export function approvalLink(token: string): string {
  return `${publicBaseUrl()}/a/${token}`;
}
