import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Colors, useThemeColors, Spacing, Radius, FontSize, supabase } from '@pastacim/shared';
import { useAuth } from '@pastacim/shared';

export default function LoginScreen() {
  const C = useThemeColors();
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleAppleLogin = async () => {
    setError(null);
    setIsAppleLoading(true);
    try {
      const { error: aError } = await signInWithApple();
      if (aError) setError(aError);
    } catch (e) {
      console.warn('[Baker login] Apple flow error:', e);
    } finally {
      setIsAppleLoading(false);
    }
  };

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
    // Google OAuth kullanıcısı kontrolü
    const { data: provider } = await supabase.rpc('get_user_auth_provider', { p_email: trimmedEmail });
    if (provider === 'google') {
      setIsResetLoading(false);
      Alert.alert(
        'Google Hesabı',
        'Bu e-posta adresi Google ile bağlantılıdır. Şifre sıfırlamak yerine "Google ile Giriş Yap" butonunu kullanın.',
      );
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: 'pastacim-pro://auth-callback?type=recovery',
    });
    setIsResetLoading(false);
    if (resetError) {
      Alert.alert('Hata', 'Bağlantı gönderilemedi: ' + resetError.message);
    } else {
      Alert.alert('✅ Gönderildi', 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.');
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsGoogleLoading(true);

    // Hiçbir await zinciri sonsuza dek asılı kalmasın — Promise.race ile sınır koy.
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
      ]);

    try {
      const redirectUrl = makeRedirectUri({ scheme: 'pastacim-pro', path: 'auth-callback' });
      const { error: gError } = await withTimeout(signInWithGoogle(redirectUrl), 15000, 'signInWithGoogle');
      if (gError) {
        setError(gError);
        return;
      }

      const sessRes = await withTimeout(supabase.auth.getSession(), 5000, 'getSession');
      const s = sessRes.data.session;
      if (!s?.user?.id) return;

      // useAuth Context değil — _layout.tsx'in profile state'i gecikebilir.
      // DB'den is_baker'ı doğrudan oku, trigger race ihtimaline karşı kısa retry.
      let isBakerFromDb = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const profRes = await withTimeout(
            (async () => await supabase.from('users').select('is_baker').eq('id', s.user.id).maybeSingle())(),
            5000,
            'fetchIsBaker'
          );
          if (!profRes.error && profRes.data) {
            isBakerFromDb = profRes.data.is_baker === true;
            break;
          }
        } catch {
          // timeout/network — retry'a düş
        }
        if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 800));
      }

      router.replace(isBakerFromDb ? '/(baker)' : '/(baker)/setup');
    } catch (e) {
      console.warn('[Baker login] Google flow error:', e);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);

    // Basit doğrulama
    if (!email.trim()) return setError('E-posta adresini girin.');
    if (!password) return setError('Şifreyi girin.');

    setIsLoading(true);
    const { error: authError } = await signIn(email.trim().toLowerCase(), password, rememberMe);
    setIsLoading(false);

    if (authError) {
      setError(authError);
    }
    // Başarılı girişte _layout.tsx otomatik yönlendirir
  };

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
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>

        {/* ─── Başlık ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>👋</Text>
          <Text style={[styles.title, { color: C.text }]}>Tekrar hoş geldin!</Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            Hesabına giriş yap
          </Text>
        </View>

        {/* ─── Form ────────────────────────────────────────────────── */}
        <View style={styles.form}>
          {/* E-posta */}
          <View>
            <Text style={[styles.label, { color: C.textSecondary }]}>E-posta</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: C.card,
                  borderColor: C.border,
                  color: C.text,
                },
              ]}
              placeholder="ornek@mail.com"
              placeholderTextColor={C.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
            />
          </View>

          {/* Şifre */}
          <View>
            <Text style={[styles.label, { color: C.textSecondary }]}>Şifre</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: C.card,
                    borderColor: C.border,
                    color: C.text,
                  },
                ]}
                placeholder="••••••••"
                placeholderTextColor={C.placeholder}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
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

          {/* Hata mesajı */}
          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          {/* Beni Hatırla + Şifremi unuttum */}
          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe((v) => !v)}
              activeOpacity={0.7}
            >
              <Switch
                value={rememberMe}
                onValueChange={setRememberMe}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#FFF"
              />
              <Text style={[styles.rememberText, { color: C.textSecondary }]}>Beni Hatırla</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleForgotPassword} disabled={isResetLoading}>
              {isResetLoading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Text style={[styles.forgotText, { color: C.primary }]}>Şifremi unuttum</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Giriş Butonu */}
          <TouchableOpacity
            style={[
              styles.btnPrimary,
              { backgroundColor: C.primary },
              isLoading && styles.btnDisabled,
            ]}
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
        </View>

        {/* ─── Ayraç ───────────────────────────────────────────────── */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
          <Text style={[styles.dividerText, { color: C.placeholder }]}>veya</Text>
          <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
        </View>

        {/* ─── Google Giriş ────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleLogin}
          disabled={isGoogleLoading}
          activeOpacity={0.85}
        >
          {isGoogleLoading ? (
            <ActivityIndicator color="#1F1F1F" />
          ) : (
            <>
              <Text style={styles.googleBtnIcon}>G</Text>
              <Text style={styles.googleBtnText}>Google ile Giriş Yap</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ─── Apple Giriş (iOS) ───────────────────────────────────── */}
        {Platform.OS === 'ios' && (
          <View style={styles.appleBtnWrap}>
            {isAppleLoading ? (
              <ActivityIndicator color={C.text} style={{ marginTop: Spacing.md }} />
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  C.background === '#FFFFFF' || C.background === '#FFF' || C.background === '#fff'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                }
                cornerRadius={Radius.md}
                style={styles.appleBtn}
                onPress={handleAppleLogin}
              />
            )}
          </View>
        )}

        {/* ─── Alt Link ────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: C.textSecondary }]}>
            Hesabın yok mu?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/register')}>
            <Text style={[styles.footerLink, { color: C.primary }]}>Kayıt ol</Text>
          </TouchableOpacity>
        </View>
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
  errorBox: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  optionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  rememberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  rememberText: { fontSize: FontSize.sm, fontWeight: '600' },
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
    marginBottom: Spacing.lg,
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
    marginBottom: Spacing.lg,
  },
  appleBtn: {
    width: '100%',
    height: 50,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: FontSize.md,
  },
  footerLink: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
