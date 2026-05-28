import { useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type UserProfile = Database['public']['Tables']['users']['Row'];

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isBaker: boolean;
  isCustomer: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
}

export function useAuth(): AuthState & AuthActions {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, phone, full_name, avatar_url, is_customer, is_baker, wallet_balance, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[useAuth] Profil yüklenemedi:', error.message);
      return;
    }
    setProfile(data);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }, [session, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user?.id) {
        loadProfile(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.user?.id) {
          await loadProfile(s.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'E-posta veya şifre hatalı.' };
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: 'E-postanızı doğrulamanız gerekiyor.' };
      }
      if (error.message.includes('Too many requests')) {
        return { error: 'Çok fazla deneme. Lütfen bekleyin.' };
      }
      return { error: 'Giriş yapılamadı. Lütfen tekrar deneyin.' };
    }

    return { error: null };
  }, []);

  const signUp = useCallback(async ({
    email,
    password,
    fullName,
  }: SignUpParams): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        return { error: 'Bu e-posta adresi zaten kullanımda.' };
      }
      if (error.message.includes('Password should be')) {
        return { error: 'Şifre en az 6 karakter olmalıdır.' };
      }
      if (error.message.includes('Invalid email')) {
        return { error: 'Geçerli bir e-posta adresi girin.' };
      }
      return { error: `Hata: ${error.message}` };
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (uid) {
      await _db.from('users').update({ push_token: null }).eq('id', uid).then(() => {}).catch(() => {});
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return {
    session,
    user: session?.user ?? null,
    profile,
    isBaker: profile?.is_baker ?? false,
    isCustomer: profile?.is_customer ?? true,
    isLoading,
    isAuthenticated: !!session,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
}
