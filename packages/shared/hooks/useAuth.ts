import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';
import { sendAppEmail } from '../lib/notifications';
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
  signUp: (params: SignUpParams) => Promise<{ error: string | null; alreadyExisted?: boolean; signedIn?: boolean }>;
  signInWithGoogle: (redirectUrl: string) => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
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
      .select('id, email, phone, full_name, avatar_url, is_customer, is_baker, wallet_balance, push_token, role, token_balance, email_opt_out, email_unsub_token, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[useAuth] Profil yüklenemedi:', error.message);
      return false;
    }
    setProfile(data);
    // Hoşgeldin e-postası: ilk authenticated yüklemede tetiklenir, sunucu
    // tarafında (sent_emails) tekilleştirilir — yani kullanıcı başına bir kez.
    // signUp anında session olmadığından (caller doğrulaması başarısız) burada
    // yapılıyor.
    sendAppEmail(userId, 'welcome');
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
      (_event, s) => {
        // ÖNEMLİ: Supabase _notifyAllSubscribers tüm handler'ları AWAIT eder.
        // Burada await yaparsak exchangeCodeForSession/setSession hiç dönmez
        // → signInWithGoogle hang olur → spinner sonsuza dek döner.
        // Bu yüzden senkron ol; loadProfile'ı fire-and-forget yap.
        if (s?.user?.id) {
          setSession(s);
          void (async () => {
            let ok = await loadProfile(s.user.id);
            if (!ok) {
              await new Promise<void>(r => setTimeout(r, 2000));
              await loadProfile(s.user.id);
            }
          })();
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
  }: SignUpParams): Promise<{ error: string | null; alreadyExisted?: boolean; signedIn?: boolean }> => {
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
        return { error: 'Bu e-posta adresi zaten kullanımda.', alreadyExisted: true };
      }
      if (error.message.includes('Password should be')) {
        return { error: 'Şifre en az 6 karakter olmalıdır.' };
      }
      if (error.message.includes('Invalid email')) {
        return { error: 'Geçerli bir e-posta adresi girin.' };
      }
      return { error: `Hata: ${error.message}` };
    }

    // "Akıllı" e-posta doğrulama:
    // Supabase, zaten kayıtlı bir e-posta için signUp çağrıldığında (enumeration
    // koruması nedeniyle) hata DÖNMEZ; bunun yerine `identities` dizisi BOŞ olan bir
    // user döner. Bu, "kullanıcı zaten var" sinyalidir. Bu durumda doğrulama ekranı
    // gösterme (çünkü e-posta zaten doğrulanmış olabilir ve hiç mail gelmez);
    // bunun yerine verilen kimlik bilgileriyle doğrudan giriş yapmayı dene.
    const identities = data.user?.identities;
    const emailAlreadyExists = !!data.user && Array.isArray(identities) && identities.length === 0;

    if (emailAlreadyExists) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) {
        // Şifre doğru — kullanıcı zaten var, doğrudan içeri al.
        return { error: null, alreadyExisted: true, signedIn: true };
      }
      // Şifre yanlış / e-posta doğrulanmamış → net Türkçe mesaj, login'e yönlendir.
      if (signInError.message.includes('Email not confirmed')) {
        return {
          error: 'Bu e-posta zaten kayıtlı ama henüz doğrulanmamış. Lütfen gelen kutunuzdaki doğrulama bağlantısına tıklayın.',
          alreadyExisted: true,
        };
      }
      return {
        error: 'Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın veya şifrenizi sıfırlayın.',
        alreadyExisted: true,
      };
    }

    // E-posta doğrulama zorlaması:
    // Supabase Auth Settings'te "Confirm email" kapalıysa veya bir şekilde
    // signUp anında session dönerse, kullanıcıyı zorla çıkış yap.
    // Sadece e-posta linkine tıklayınca (onAuthStateChange tetikleyerek) login olsun.
    if (data.session && !data.user?.email_confirmed_at) {
      await supabase.auth.signOut();
    }

    // Buraya geldiysek: gerçekten yeni, doğrulanmamış bir kayıt → doğrulama ekranı göster.
    return { error: null, alreadyExisted: false };
  }, []);

  const signInWithGoogle = useCallback(async (redirectUrl: string): Promise<{ error: string | null }> => {
    // Tüm gövdeyi try/catch ile sarmala — herhangi bir beklenmedik hata
    // çağıranı sonsuz spinner ile bırakmasın.
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        console.error('[Google] signInWithOAuth error:', error?.message);
        return { error: 'Google girişi başlatılamadı: ' + (error?.message ?? 'bilinmeyen') };
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { error: null };
      }

      if (result.type !== 'success') {
        return { error: 'Google girişi tamamlanamadı.' };
      }

      // Supabase oturum kodunu URL'den çıkarıp session oluştur
      // URL formatı: redirectUrl#access_token=...&refresh_token=...  veya  ?code=...
      // NOT: new URL() bazı RN ortamlarında custom scheme'ler (pastacim-pro://)
      // için exception fırlatabiliyor — bu yüzden saf string parsing kullanıyoruz.
      const url = result.url;

      // 1) Hash fragment (implicit / email confirm)
      const hashIndex = url.indexOf('#');
      if (hashIndex !== -1) {
        const hashParams = new URLSearchParams(url.substring(hashIndex + 1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setErr) {
            console.error('[Google] setSession error:', setErr.message);
            return { error: 'Google oturumu açılamadı: ' + setErr.message };
          }
          // setSession sonrası onAuthStateChange zaten tetiklendi ve loadProfile
          // başlattı (fire-and-forget). Burada await etmiyoruz: çağıran kod
          // hemen geri dönsün, _layout.tsx / handleGoogleLogin profili çekecek.
          return { error: null };
        }
      }

      // 2) Query string (PKCE / authorization code)
      const queryIndex = url.indexOf('?');
      if (queryIndex !== -1) {
        // Hash fragment varsa, query'yi hash'ten önce kestiğimizden emin ol
        const queryEnd = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : url.length;
        const query = url.substring(queryIndex + 1, queryEnd);
        const code = new URLSearchParams(query).get('code');
        if (code) {
          // Session zaten oluştuysa (deep-link handler bizden önce davrandıysa) tekrar exchange etme
          const { data: { session: existing } } = await supabase.auth.getSession();
          if (existing?.user?.id) {
            setSession(existing);
            return { error: null };
          }

          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(url);
          if (sessionError) {
            // PKCE kodu zaten tüketildiyse (deep-link handler ile yarış), bunu hata sayma:
            // session muhtemelen oluşmuştur.
            const { data: { session: afterErr } } = await supabase.auth.getSession();
            if (afterErr?.user?.id) {
              setSession(afterErr);
              return { error: null };
            }
            console.error('[Google] exchangeCodeForSession error:', sessionError.message);
            return { error: 'Google oturumu açılamadı: ' + sessionError.message };
          }
          // onAuthStateChange zaten session + loadProfile'ı fire-and-forget tetikledi.
          // Burada bekleyip await etmiyoruz — caller direkt getSession yapacak.
          return { error: null };
        }
      }

      console.error('[Google] callback URL\'de ne token ne code var:', url);
      return { error: 'Google yanıtı çözümlenemedi.' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Google] unexpected error:', msg);
      // Beklenmedik hata olsa bile session oluşmuş olabilir (deep-link path)
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.user?.id) {
          setSession(s);
          return { error: null };
        }
      } catch {
        // ignore
      }
      return { error: 'Google girişi sırasında hata oluştu: ' + msg };
    }
  }, []);

  const signInWithApple = useCallback(async (): Promise<{ error: string | null }> => {
    if (Platform.OS !== 'ios') {
      return { error: 'Apple ile giriş yalnızca iOS cihazlarda kullanılabilir.' };
    }
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        return { error: 'Apple kimlik tokeni alınamadı.' };
      }

      const { data: signInData, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        console.error('[Apple] signInWithIdToken error:', error.message);
        return { error: 'Apple oturumu açılamadı: ' + error.message };
      }

      // Apple yalnızca İLK girişte isim döner ("E-postamı Gizle" seçilirse hiç
      // dönmeyebilir). Apple bir isim verdiyse users.full_name + auth metadata'ya yaz.
      // İsim gelmezse _layout.tsx'teki NameEntryModal kapısı kullanıcıya isim girdirir.
      const given = credential.fullName?.givenName?.trim() ?? '';
      const family = credential.fullName?.familyName?.trim() ?? '';
      const appleFullName = `${given} ${family}`.trim();
      const uid = signInData.user?.id;
      if (appleFullName && uid) {
        try {
          await supabase.from('users').update({ full_name: appleFullName }).eq('id', uid);
          await supabase.auth.updateUser({ data: { full_name: appleFullName } });
        } catch (e) {
          console.warn('[Apple] full_name kaydı başarısız:', e);
        }
      }

      // onAuthStateChange ile session yakalanacak; çağıran tarafa direkt dön
      return { error: null };
    } catch (e) {
      // Kullanıcı sheet'i iptal ettiyse sessizce dön
      const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : null;
      if (code === 'ERR_REQUEST_CANCELED') {
        return { error: null };
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Apple] unexpected error:', msg);
      return { error: 'Apple girişi sırasında hata oluştu: ' + msg };
    }
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
    signInWithApple,
    signOut,
    refreshProfile,
  };
}
