import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';

export default function ResetPasswordScreen() {
  const C = useThemeColors();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (updateError) {
      if (updateError.message.includes('oauth') || updateError.message.includes('identity')) {
        Alert.alert(
          'Google Hesabı',
          'Bu hesap Google ile bağlantılıdır. Şifre belirleyemezsiniz. Lütfen "Google ile Giriş Yap" butonunu kullanın.',
          [{ text: 'Tamam', onPress: () => router.replace('/(auth)/login') }],
        );
      } else {
        setError('Şifre güncellenemedi: ' + updateError.message);
      }
      return;
    }
    Alert.alert('✅ Başarılı', 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.', [
      { text: 'Giriş Yap', onPress: () => router.replace('/(auth)/login') },
    ]);
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
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🔐</Text>
          <Text style={[styles.title, { color: C.text }]}>Yeni Şifre Belirle</Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            En az 6 karakter içeren yeni bir şifre girin.
          </Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={[styles.label, { color: C.textSecondary }]}>Yeni Şifre</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder="••••••••"
                placeholderTextColor={C.placeholder}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                autoFocus
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
                <Text style={{ color: C.placeholder, fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={[styles.label, { color: C.textSecondary }]}>Şifre Tekrar</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="••••••••"
              placeholderTextColor={C.placeholder}
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
            />
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: C.primary }, isLoading && { opacity: 0.7 }]}
            onPress={handleReset}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>Şifremi Güncelle</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingTop: 80, paddingBottom: Spacing.xxl },
  header: { marginBottom: Spacing.xl },
  headerEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.md, lineHeight: 22 },
  form: { gap: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 52 },
  eyeButton: { position: 'absolute', right: Spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  errorBox: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm },
  errorText: { fontSize: FontSize.sm, fontWeight: '500' },
  btnPrimary: { paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.sm },
  btnPrimaryText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
});
