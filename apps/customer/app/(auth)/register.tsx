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
import { useThemeColors, ThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import { useAuth } from '@pastacim/shared';

export default function RegisterScreen() {
  const C = useThemeColors();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Ad soyad gerekli.';
    if (fullName.trim().length < 3) return 'Ad soyad en az 3 karakter olmalı.';
    if (!email.trim()) return 'E-posta adresi gerekli.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Geçerli bir e-posta girin.';
    if (!password) return 'Şifre gerekli.';
    if (password.length < 6) return 'Şifre en az 6 karakter olmalı.';
    if (password !== confirmPassword) return 'Şifreler eşleşmiyor.';
    return null;
  };

  const handleRegister = async () => {
    setError(null);
    const validationError = validate();
    if (validationError) return setError(validationError);

    setIsLoading(true);
    const { error: authError } = await signUp({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      redirectTo: 'pastacim://auth-callback',
    });
    setIsLoading(false);

    if (authError) {
      setError(authError);
    } else {
      setSuccess(true);
    }
  };

  // ─── Başarı Ekranı ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <View style={[styles.successContainer, { backgroundColor: C.background }]}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={[styles.successTitle, { color: C.text }]}>Hoş geldin!</Text>
        <Text style={[styles.successSubtitle, { color: C.textSecondary }]}>
          Hesabın oluşturuldu.{'\n'}
          {'Hesabını doğrulamak için e-postanı kontrol et.'}
        </Text>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: C.primary }]}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.btnPrimaryText}>Giriş Yap</Text>
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
        {/* ─── Geri ───────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>

        {/* ─── Başlık ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🎂</Text>
          <Text style={[styles.title, { color: C.text }]}>Hesap Oluştur</Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            Birkaç adımda başla
          </Text>
        </View>

        {/* ─── Form ───────────────────────────────────────────────── */}
        <View style={styles.form}>
          <FormInput
            label="Ad Soyad"
            placeholder="Ayşe Yılmaz"
            value={fullName}
            onChangeText={(t) => { setFullName(t); setError(null); }}
            autoCapitalize="words"
            autoComplete="name"
            colors={C}
          />

          <FormInput
            label="E-posta"
            placeholder="ornek@mail.com"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            colors={C}
          />

          <View>
            <Text style={[styles.label, { color: C.textSecondary }]}>Şifre</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, {
                  backgroundColor: C.card,
                  borderColor: C.border,
                  color: C.text,
                }]}
                placeholder="En az 6 karakter"
                placeholderTextColor={C.placeholder}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
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

          <FormInput
            label="Şifre Tekrar"
            placeholder="Şifreyi tekrar gir"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
            secureTextEntry
            colors={C}
          />

          {/* Hata */}
          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          {/* Kayıt Butonu */}
          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: C.primary }, isLoading && styles.btnDisabled]}
            activeOpacity={0.85}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>🎂 Hesap Oluştur</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ─── Alt Link ───────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: C.textSecondary }]}>
            Zaten hesabın var mı?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={[styles.footerLink, { color: C.primary }]}>Giriş yap</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Alt Bileşenler ──────────────────────────────────────────────────────────

function FormInput({
  label,
  colors,
  ...props
}: {
  label: string;
  colors: ThemeColors;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholderTextColor={colors.placeholder}
        {...props}
      />
    </View>
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
  successTitle: { fontSize: FontSize.xxxl, fontWeight: '800', textAlign: 'center' },
  successSubtitle: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 24 },
  backButton: { marginBottom: Spacing.xl },
  backText: { fontSize: FontSize.md, fontWeight: '600' },
  header: { marginBottom: Spacing.lg },
  headerEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.md },
  form: { gap: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.md,
  },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 52 },
  eyeButton: {
    position: 'absolute',
    right: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  eyeText: { fontSize: 18 },
  errorBox: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm },
  errorText: { fontSize: FontSize.sm, fontWeight: '500' },
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
  btnPrimaryText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
  btnDisabled: { opacity: 0.7 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.lg },
  footerText: { fontSize: FontSize.md },
  footerLink: { fontSize: FontSize.md, fontWeight: '700' },
});
