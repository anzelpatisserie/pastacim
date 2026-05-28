import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,

  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import { useAuth } from '@pastacim/shared';

export default function LoginScreen() {
  const C = useThemeColors();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setError(null);

    // Basit doğrulama
    if (!email.trim()) return setError('E-posta adresini girin.');
    if (!password) return setError('Şifreyi girin.');

    setIsLoading(true);
    const { error: authError } = await signIn(email.trim().toLowerCase(), password);
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

          {/* Şifremi unuttum */}
          <TouchableOpacity style={styles.forgotWrapper}>
            <Text style={[styles.forgotText, { color: C.primary }]}>
              Şifremi unuttum
            </Text>
          </TouchableOpacity>

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
  forgotWrapper: {
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
