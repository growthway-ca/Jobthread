import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Contractor } from './types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  contractor: Contractor | null;
  /** Set when the profile couldn't be loaded at all (not the same as "no profile yet"). */
  profileError: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const CORE_PROFILE_COLUMNS = 'id, name, business_name, phone';
const PROFILE_COLUMNS = `${CORE_PROFILE_COLUMNS}, etransfer_email, google_review_url, google_rating, google_review_count, credentials`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setContractor(null);
      return;
    }
    const query = (columns: string) => supabase.from('contractors').select(columns).eq('id', s.user.id).maybeSingle();
    let res = await query(PROFILE_COLUMNS);
    // If a database update hasn't been run yet, newer columns are missing. Fall
    // back to the ones every version has, so the app keeps working meanwhile.
    if (res.error) res = await query(CORE_PROFILE_COLUMNS);
    setProfileError(Boolean(res.error));
    setContractor(res.error ? null : ((res.data as Contractor | null) ?? null));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Token refreshes don't change who is signed in; skip the extra query.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Supabase warns against awaiting its own calls inside this callback.
        setTimeout(() => void loadProfile(s), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value: AuthState = {
    loading,
    session,
    contractor,
    profileError,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
