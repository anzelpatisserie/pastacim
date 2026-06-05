import { useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

WebBrowser.maybeCompleteAuthSession();

const EPHEMERAL_SESSION_KEY = 'pastacim_ephemeral_session';

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
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  signInWithGoogle: (redirectUrl: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  redirectTo?: string;
}

export function useAuth(): AuthState & AuthActions {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, phone, full_name, avatar_url, is_customer, is_baker, wallet_balance, push_token, role, token_balance, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[useAuth] Profil yüklenemedi:', error.message);
      return false;
    }
    setProfile(data);
    return true;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }, [session, loadProfile]);

  useEffect(() => {
    (async () => {
      // "Beni Hatırla" kapalıyken giriş yapıldıysa app yeniden açılışta otomatik çıkış yap
      const ephemeral = await SecureStore.getItemAsync(EPHEMERAL_SESSION_KEY);
      if (ephemeral === 'true') {
        await SecureStore.deleteItemAsync(EPHEMERAL_SESSION_KEY);
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      if (s?.user?.id) {
        const ok = await loadProfile(s.user.id);
        if (!ok) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
        }
      }
      setIsLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        // Profil yüklenene kadar isLoading=true tut ki layout
        // henüz boş profile göre yanlış ekrana yönlendirme yapmasın
        // (özellikle Google OAuth sonrası is_baker=false sanıp setup'a atıyordu).
        if (s?.user?.id) {
          setIsLoading(true);
          setSession(s);
          await loadProfile(s.user.id);
          setIsLoading(false);
        } else {
          setSession(s);
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (
    email: string,
    password: string,
    rememberMe: boolean = true
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (!error) {
      if (rememberMe) {
        await SecureStore.deleteItemAsync(EPHEMERAL_SESSION_KEY);
      } else {
        await SecureStore.setItemAsync(EPHEMERAL_SESSION_KEY, 'true');
      }
    }

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
    redirectTo,
  }: SignUpParams): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTo,
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

    // E-posta doğrulama zorlaması:
    // Supabase Auth Settings'te "Confirm email" kapalıysa veya bir şekilde
    // signUp anında session dönerse, kullanıcıyı zorla çıkış yap.
    // Sadece e-posta linkine tıklayınca (onAuthStateChange tetikleyerek) login olsun.
    if (data.session && !data.user?.email_confirmed_at) {
      await supabase.auth.signOut();
    }

    return { error: null };
  }, []);

  const signInWithGoogle = useCallback(async (redirectUrl: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      console.error('[Google] signInWithOAuth error:', error?.message);
      return { error: 'Google girişi başlatılamadı: ' + (error?.message ?? 'bilinmeyen') };
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    if (result.type === 'success') {
      // Supabase oturum kodunu URL'den çıkarıp session oluştur
      // URL formatı: redirectUrl#access_token=...&refresh_token=...  veya  ?code=...
      const url = result.url;
      const params = new URL(url);
      const hashFragment = url.includes('#') ? url.split('#')[1] : '';
      const hashParams = new URLSearchParams(hashFragment);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const code = params.searchParams.get('code');

      // 1) Önce token fragment varsa direkt set et
      if (accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr) {
          console.error('[Google] setSession error:', setErr.message);
          return { error: 'Google oturumu açılamadı: ' + setErr.message };
        }
        return { error: null };
      }

      // 2) Code varsa exchange et
      if (code) {
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(url);
        if (sessionError) {
          console.error('[Google] exchangeCodeForSession error:', sessionError.message);
          return { error: 'Google oturumu açılamadı: ' + sessionError.message };
        }
        return { error: null };
      }

      console.error('[Google] callback URL\'de ne token ne code var:', url);
      return { error: 'Google yanıtı çözümlenemedi.' };
    }
    if (result.type === 'cancel' || result.type === 'dismiss') return { error: null };
    return { error: 'Google girişi tamamlanamadı.' };
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
    signInWithGoogle,
    signOut,
    refreshProfile,
  };
}
