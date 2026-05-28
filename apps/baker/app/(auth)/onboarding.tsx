import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors, ThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen() {
  const scheme = useColorScheme();
  const C = useThemeColors();

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


      {/* ─── Butonlar ────────────────────────────────────────────────── */}
      <View style={styles.buttonSection}>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: C.primary }]}
          activeOpacity={0.85}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={styles.btnPrimaryText}>Ücretsiz Başla</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: C.border }]}
          activeOpacity={0.7}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={[styles.btnSecondaryText, { color: C.text }]}>
            Zaten hesabım var
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Alt Bilgi ───────────────────────────────────────────────── */}
      <Text style={[styles.legal, { color: C.placeholder }]}>
        Devam ederek Kullanım Koşulları ve{'\n'}Gizlilik Politikası'nı kabul etmiş olursunuz.
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
  buttonSection: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  btnPrimary: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    shadowColor: '#D4526E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  btnSecondary: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: Radius.full,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  btnSecondaryText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  legal: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
});
