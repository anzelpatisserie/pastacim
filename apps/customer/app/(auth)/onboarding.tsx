import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useThemeColors, ThemeColors, Spacing, Radius, FontSize, supabase } from '@pastacim/shared';
import { useAuth } from '@pastacim/shared';

export default function OnboardingScreen() {
  const scheme = useColorScheme();
  const C = useThemeColors();
  const { signInWithGoogle, signInWithApple } = useAuth();

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setIsGoogleLoading(true);

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
      ]);

    try {
      const redirectUrl = makeRedirectUri({ scheme: 'pastacim', path: 'auth-callback' });
      const { error: gError } = await withTimeout(signInWithGoogle(redirectUrl), 15000, 'signInWithGoogle');
      if (gError) {
        setError(gError);
        return;
      }

      const sessRes = await withTimeout(supabase.auth.getSession(), 5000, 'getSession');
      const s = sessRes.data.session;
      if (!s?.user?.id) return;

      // Profilin var olduğunu doğrula (trigger race ihtimaline karşı)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const profRes = await withTimeout(
            (async () => await supabase.from('users').select('id').eq('id', s.user.id).maybeSingle())(),
            5000,
            'fetchProfile'
          );
          if (!profRes.error && profRes.data) break;
        } catch {
          // timeout/network — retry
        }
        if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 800));
      }
      router.replace('/(customer)');
    } catch (e) {
      console.warn('[Customer onboarding] Google flow error:', e);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleApple = async () => {
    setError(null);
    setIsAppleLoading(true);
    try {
      const { error: aError } = await signInWithApple();
      if (aError) setError(aError);
    } catch (e) {
      console.warn('[Customer onboarding] Apple flow error:', e);
    } finally {
      setIsAppleLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* ─── Üst Dekorasyon ─────────────────────────────────────────── */}
      <View style={[styles.topDecor, { backgroundColor: C.primary + '22' }]} />

      {/* ─── Logo & Slogan ───────────────────────────────────────────── */}
      <View style={styles.heroSection}>
        <View style={[styles.logoCircle, { backgroundColor: C.primary }]}>
          <Text style={styles.logoEmoji}>🎂</Text>
        </View>
        <Text style={[styles.appName, { color: C.primary }]}>Pastacım</Text>
        <Text style={[styles.tagline, { color: C.textSecondary }]}>
          Hayalindeki pastayı{'\n'}yakınındaki ustalar yapsın
        </Text>
      </View>

      {/* ─── Özellik Kartları ────────────────────────────────────────── */}
      <View style={styles.featuresRow}>
        <FeatureCard emoji="📍" label="Yakınında" color={C} />
        <FeatureCard emoji="🏆" label="En iyiler" color={C} />
        <FeatureCard emoji="💬" label="Teklif al" color={C} />
      </View>

      {/* ─── Hata Mesajı ─────────────────────────────────────────────── */}
      {error && (
        <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
          <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
        </View>
      )}

      {/* ─── Butonlar ────────────────────────────────────────────────── */}
      <View style={styles.buttonSection}>
        {/* Google ile devam et */}
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

        {/* Apple ile devam et (yalnızca iOS) */}
        {Platform.OS === 'ios' && (
          <View style={styles.appleBtnWrap}>
            {isAppleLoading ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  C.background === '#FFFFFF' || C.background === '#FFF' || C.background === '#fff'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                }
                cornerRadius={Radius.full}
                style={styles.appleBtn}
                onPress={handleApple}
              />
            )}
          </View>
        )}

        {/* E-posta ile devam et */}
        <TouchableOpacity
          style={[styles.emailBtn, { borderColor: C.border }]}
          activeOpacity={0.7}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={[styles.emailBtnText, { color: C.text }]}>E-posta ile devam et</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Alt Bilgi ───────────────────────────────────────────────── */}
      <Text style={[styles.legal, { color: C.placeholder }]}>
        {'Devam ederek '}
        <Text
          style={{ color: C.primary, textDecorationLine: 'underline' }}
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/terms')}
        >
          Kullanım Koşulları
        </Text>
        {' ve\n'}
        <Text
          style={{ color: C.primary, textDecorationLine: 'underline' }}
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/privacy')}
        >
          Gizlilik Politikası
        </Text>
        {"'nı kabul etmiş olursunuz."}
      </Text>
    </View>
  );
}

function FeatureCard({
  emoji,
  label,
  color,
}: {
  emoji: string;
  label: string;
  color: ThemeColors;
}) {
  return (
    <View style={[styles.featureCard, { backgroundColor: color.card, borderColor: color.border }]}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={[styles.featureLabel, { color: color.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  topDecor: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#D4526E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoEmoji: {
    fontSize: 48,
  },
  appName: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: FontSize.lg,
    textAlign: 'center',
    lineHeight: 26,
  },
  featuresRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  featureCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  featureEmoji: {
    fontSize: 24,
  },
  featureLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  errorBox: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  buttonSection: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
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
    width: '100%',
  },
  appleBtn: {
    width: '100%',
    height: 50,
  },
  emailBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: Radius.full,
    alignItems: 'center',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  emailBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  legal: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
});
