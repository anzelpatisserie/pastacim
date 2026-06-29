import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { authRedirectUrl } from '@pastacim/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useThemeColors, Spacing, Radius, FontSize, supabase } from '@pastacim/shared';
import { useAuth } from '@pastacim/shared';

type Mode = 'email' | 'login' | 'signup' | 'social_hint';

export default function LoginScreen() {
  const C = useThemeColors();
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth();

  // Progressive durum
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [socialProvider, setSocialProvider] = useState<'google' | 'apple' | null>(null);

  // Genel yüklenme / hata
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Kayıt başarı ekranı
  const [signupSuccess, setSignupSuccess] = useState(false);

  // ─── Başlık moduna göre ─────────────────────────────────────────────────────
  const headerTitle: Record<Mode, string> = {
    email: 'E-posta ile devam et',
    login: 'Giriş Yap',
    signup: 'Hesap Oluştur',
    social_hint: 'Sosyal Hesap Tespit Edildi',
  };

  // ─── Devam Et (mode=email) ──────────────────────────────────────────────────
  const handleContinue = async () => {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return setError('E-posta adresini girin.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setError('Geçerli bir e-posta adresi girin.');

    setIsLoading(true);
    try {
      const { data: provider } = await supabase.rpc('get_user_auth_provider', { p_email: trimmed });
      if (provider === 'email') {
        setMode('login');
      } else if (provider === 'google' || provider === 'apple') {
        setSocialProvider(provider);
        setMode('social_hint');
      } else {
        // null / bilinmiyor → yeni kullanıcı
        setMode('signup');
      }
    } catch {
      // RPC hatası → giriş moduna düş, kullanıcı şifre dener
      setMode('login');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Giriş Yap (mode=login) ─────────────────────────────────────────────────
  const handleLogin = async () => {
    setError(null);
    if (!password) return setError('Şifreyi girin.');
    setIsLoading(true);
    const { error: authError } = await signIn(email.trim().toLowerCase(), password, true);
    setIsLoading(false);
    if (authError) setError(authError);
    // Başarılıysa _layout.tsx onAuthStateChange üzerinden /(customer)'a yönlendirir
  };

  // ─── Şifremi Unuttum ─────────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert('E-posta Gerekli', 'Şifre sıfırlama bağlantısı için önce e-posta adresinizi girin.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert('Geçersiz E-posta', 'Lütfen geçerli bir e-posta adresi girin.');
      return;
    }
    setIsResetLoading(true);
    const { data: provider } = await supabase.rpc('get_user_auth_provider', { p_email: trimmedEmail });
    if (provider === 'google') {
      setIsResetLoading(false);
      Alert.alert(
        'Google Hesabı',
        'Bu e-posta adresi Google ile bağlantılıdır. Şifre sıfırlamak yerine "Google ile devam et" butonunu kullanın.',
      );
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: authRedirectUrl('pastacim', true),
    });
    setIsResetLoading(false);
    if (resetError) {
      Alert.alert('Hata', 'Bağlantı gönderilemedi: ' + resetError.message);
    } else {
      Alert.alert('✅ Gönderildi', 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.');
    }
  };

  // ─── Hesap Oluştur (mode=signup) ────────────────────────────────────────────
  const handleSignup = async () => {
    setError(null);
    if (!fullName.trim()) return setError('Ad soyad gerekli.');
    if (fullName.trim().length < 3) return setError('Ad soyad en az 3 karakter olmalı.');
    if (!password) return setError('Şifre gerekli.');
    if (password.length < 6) return setError('Şifre en az 6 karakter olmalı.');

    setIsLoading(true);
    const { error: authError, alreadyExisted, signedIn } = await signUp({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      redirectTo: authRedirectUrl('pastacim'),
    });
    setIsLoading(false);

    // Zaten kayıtlı + şifre doğru → oturum açıldı, _layout yönlendirir
    if (signedIn) return;

    if (authError) {
      setError(authError);
      if (alreadyExisted) {
        // Zaten kayıtlı ama şifre yanlış → login moduna geç
        setTimeout(() => setMode('login'), 1500);
      }
      return;
    }

    // Gerçekten yeni kayıt → doğrulama ekranı
    setSignupSuccess(true);
  };

  // ─── Google ─────────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError(null);
    setIsGoogleLoading(true);

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
      ]);

    try {
      const redirectUrl = authRedirectUrl('pastacim');
      const { error: gError } = await withTimeout(signInWithGoogle(redirectUrl), 15000, 'signInWithGoogle');
      if (gError) {
        setError(gError);
        return;
      }

      const sessRes = await withTimeout(supabase.auth.getSession(), 5000, 'getSession');
      const s = sessRes.data.session;
      if (!s?.user?.id) return;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const profRes = await withTimeout(
            (async () => await supabase.from('users').select('id').eq('id', s.user.id).maybeSingle())(),
            5000,
            'fetchProfile'
          );
          if (!profRes.error && profRes.data) break;
        } catch {
          // retry
        }
        if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 800));
      }
      router.replace('/(customer)');
    } catch (e) {
      console.warn('[Customer login] Google flow error:', e);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // ─── Apple ──────────────────────────────────────────────────────────────────
  const handleApple = async () => {
    setError(null);
    setIsAppleLoading(true);
    try {
      const { error: aError } = await signInWithApple();
      if (aError) setError(aError);
    } catch (e) {
      console.warn('[Customer login] Apple flow error:', e);
    } finally {
      setIsAppleLoading(false);
    }
  };

  // ─── Kayıt Başarı Ekranı ─────────────────────────────────────────────────────
  if (signupSuccess) {
    return (
      <View style={[styles.successContainer, { backgroundColor: C.background }]}>
        <Text style={styles.successEmoji}>📧</Text>
        <Text style={[styles.successTitle, { color: C.text }]}>E-postanı doğrula</Text>
        <Text style={[styles.successSubtitle, { color: C.textSecondary }]}>
          {email.trim().toLowerCase()} adresine bir doğrulama linki gönderdik.{'\n\n'}
          Linke tıkla, uygulama otomatik açılacak.
        </Text>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: C.primary }]}
          onPress={async () => {
            const candidates = Platform.OS === 'ios'
              ? ['message://', 'googlegmail://', 'https://mail.google.com/']
              : ['googlegmail://', 'https://mail.google.com/'];
            for (const u of candidates) {
              try {
                if (await Linking.canOpenURL(u)) { await Linking.openURL(u); return; }
              } catch {}
            }
            Linking.openURL('https://mail.google.com/');
          }}
        >
          <Text style={styles.btnPrimaryText}>📬 Posta Kutusunu Aç</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: C.border }]}
          onPress={() => {
            setSignupSuccess(false);
            setPassword('');
            setMode('login');
          }}
        >
          <Text style={[styles.btnSecondaryText, { color: C.textSecondary }]}>Zaten doğruladım → Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: C.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Geri Butonu ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (mode !== 'email') {
              setMode('email');
              setError(null);
              setPassword('');
              setFullName('');
              setSocialProvider(null);
            } else {
              router.back();
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>

        {/* ─── Başlık ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>
            {mode === 'signup' ? '🎂' : '👋'}
          </Text>
          <Text style={[styles.title, { color: C.text }]}>{headerTitle[mode]}</Text>
          {mode === 'email' && (
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              E-postanı gir, devam edelim
            </Text>
          )}
          {mode === 'login' && (
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              Hesabına giriş yap
            </Text>
          )}
          {mode === 'signup' && (
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              Birkaç adımda başla
            </Text>
          )}
        </View>

        {/* ─── Form ────────────────────────────────────────────────── */}
        <View style={styles.form}>
          {/* E-posta alanı — tüm modlarda göster */}
          <View>
            <Text style={[styles.label, { color: C.textSecondary }]}>E-posta</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: mode !== 'email' ? C.card + 'AA' : C.card,
                  borderColor: C.border,
                  color: C.text,
                },
              ]}
              placeholder="ornek@mail.com"
              placeholderTextColor={C.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={mode === 'email'}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
            />
          </View>

          {/* ── mode=signup: Ad Soyad ── */}
          {mode === 'signup' && (
            <View>
              <Text style={[styles.label, { color: C.textSecondary }]}>Ad Soyad</Text>
              <TextInput
                style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder="Ayşe Yılmaz"
                placeholderTextColor={C.placeholder}
                autoCapitalize="words"
                autoComplete="name"
                value={fullName}
                onChangeText={(t) => { setFullName(t); setError(null); }}
              />
            </View>
          )}

          {/* ── mode=login veya signup: Şifre ── */}
          {(mode === 'login' || mode === 'signup') && (
            <View>
              <Text style={[styles.label, { color: C.textSecondary }]}>Şifre</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    { backgroundColor: C.card, borderColor: C.border, color: C.text },
                  ]}
                  placeholder={mode === 'signup' ? 'En az 6 karakter' : '••••••••'}
                  placeholderTextColor={C.placeholder}
                  secureTextEntry={!showPassword}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(null); }}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Text style={[styles.eyeText, { color: C.placeholder }]}>
                    {showPassword ? '🙈' : '👁️'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── mode=social_hint: bilgi mesajı ── */}
          {mode === 'social_hint' && socialProvider && (
            <View style={[styles.hintBox, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.hintText, { color: C.text }]}>
                Bu e-posta{' '}
                <Text style={{ fontWeight: '700' }}>
                  {socialProvider === 'google' ? 'Google' : 'Apple'}
                </Text>{' '}
                ile kayıtlı. Lütfen{' '}
                <Text style={{ fontWeight: '700' }}>
                  {socialProvider === 'google' ? 'Google' : 'Apple'}
                </Text>{' '}
                ile devam et.
              </Text>
            </View>
          )}

          {/* Hata mesajı */}
          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          {/* ── Şifremi unuttum (yalnız login modunda) ── */}
          {mode === 'login' && (
            <TouchableOpacity onPress={handleForgotPassword} disabled={isResetLoading} style={styles.forgotWrap}>
              {isResetLoading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Text style={[styles.forgotText, { color: C.primary }]}>Şifremi unuttum</Text>
              )}
            </TouchableOpacity>
          )}

          {/* ── Ana aksiyon butonu ── */}
          {mode === 'email' && (
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: C.primary }, isLoading && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={handleContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>Devam Et</Text>
              )}
            </TouchableOpacity>
          )}

          {mode === 'login' && (
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: C.primary }, isLoading && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>Giriş Yap</Text>
              )}
            </TouchableOpacity>
          )}

          {mode === 'signup' && (
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: C.primary }, isLoading && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>Hesap Oluştur</Text>
              )}
            </TouchableOpacity>
          )}

          {/* ── social_hint: sosyal giriş kısa yolları ── */}
          {mode === 'social_hint' && (
            <>
              {socialProvider === 'google' && (
                <TouchableOpacity
                  style={styles.googleBtn}
                  onPress={handleGoogle}
                  disabled={isGoogleLoading}
                  activeOpacity={0.85}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color="#1F1F1F" />
                  ) : (
                    <>
                      <Text style={styles.googleBtnIcon}>G</Text>
                      <Text style={styles.googleBtnText}>Google ile devam et</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {socialProvider === 'apple' && Platform.OS === 'ios' && (
                <View style={styles.appleBtnWrap}>
                  {isAppleLoading ? (
                    <ActivityIndicator color={C.text} style={{ marginTop: Spacing.md }} />
                  ) : (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={
                        C.background === '#FFFFFF' || C.background === '#FFF' || C.background === '#fff'
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                          : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      }
                      cornerRadius={Radius.md}
                      style={styles.appleBtn}
                      onPress={handleApple}
                    />
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {/* ─── Ayraç + Sosyal Giriş (email ve login modunda) ──────── */}
        {(mode === 'email' || mode === 'login' || mode === 'signup') && (
          <>
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
              <Text style={[styles.dividerText, { color: C.placeholder }]}>veya</Text>
              <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogle}
              disabled={isGoogleLoading}
              activeOpacity={0.85}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color="#1F1F1F" />
              ) : (
                <>
                  <Text style={styles.googleBtnIcon}>G</Text>
                  <Text style={styles.googleBtnText}>Google ile devam et</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Apple (iOS) */}
            {Platform.OS === 'ios' && (
              <View style={styles.appleBtnWrap}>
                {isAppleLoading ? (
                  <ActivityIndicator color={C.text} style={{ marginTop: Spacing.md }} />
                ) : (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={
                      C.background === '#FFFFFF' || C.background === '#FFF' || C.background === '#fff'
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                        : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    }
                    cornerRadius={Radius.md}
                    style={styles.appleBtn}
                    onPress={handleApple}
                  />
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    paddingBottom: Spacing.xxl,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  successEmoji: { fontSize: 72, marginBottom: Spacing.sm },
  successTitle: { fontSize: FontSize.xxl, fontWeight: '800', textAlign: 'center' },
  successSubtitle: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.sm },
  btnSecondary: {
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
    borderWidth: 1.5,
    width: '100%',
  },
  btnSecondaryText: { fontSize: FontSize.sm, fontWeight: '600' },
  backButton: {
    marginBottom: Spacing.xl,
  },
  backText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  header: {
    marginBottom: Spacing.xl,
  },
  headerEmoji: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.md,
  },
  form: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.md,
  },
  passwordWrapper: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 18,
  },
  hintBox: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  hintText: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  forgotWrap: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  btnPrimary: {
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    marginTop: Spacing.sm,
    shadowColor: '#D4526E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: FontSize.sm },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    borderRadius: Radius.full,
    paddingVertical: 16,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  googleBtnIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  appleBtnWrap: {
    marginBottom: Spacing.sm,
  },
  appleBtn: {
    width: '100%',
    height: 50,
  },
});
