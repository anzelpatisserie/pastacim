import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors, Spacing, FontSize } from '@pastacim/shared';

export default function PrivacyScreen() {
  const scheme = useColorScheme();
  const C = useThemeColors();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={[styles.backText, { color: C.primary }]}>‹  Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.primary }]}>Gizlilik Politikası</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updated, { color: C.textSecondary }]}>
          Son güncelleme: 8 Haziran 2026
        </Text>

        <Section C={C} title="1. Geliştirici Bilgisi">
          Anzel Patisserie — anzelpatisserie@gmail.com
        </Section>

        <Section C={C} title="2. Topladığımız Veriler">
          {`• Hesap bilgileri: E-posta ve ad-soyad
• Konum: Yalnızca ön plandayken anlık konum
• Profil fotoğrafı (isteğe bağlı)
• Push token: Bildirimler için
• Sipariş/teklif içerikleri ve mesajlar`}
        </Section>

        <Section C={C} title="3. Verilerin Kullanım Amacı">
          {`• Hesap oluşturma ve kimlik doğrulama
• Konum bazlı eşleştirme
• Bildirim iletimi
• Platform güvenliği`}
        </Section>

        <Section C={C} title="4. Üçüncü Taraf Hizmetler">
          {`• Supabase (veritabanı ve auth)
• Google OAuth / Firebase Cloud Messaging
• Google Maps/Places API
• Expo (EAS)`}
        </Section>

        <Section C={C} title="5. Veri Saklama">
          Veriler hesap aktif olduğu sürece saklanır. "Hesabımı Sil" ile tüm veriler kalıcı silinir.
        </Section>

        <Section C={C} title="6. Çocukların Gizliliği">
          13 yaş altına yönelik değildir.
        </Section>

        <Section C={C} title="7. Haklarınız">
          Erişim, düzeltme, silme talep edebilirsiniz: anzelpatisserie@gmail.com
        </Section>

        <Section C={C} title="8. Değişiklikler">
          Önemli değişikliklerde bildirim yapılır.
        </Section>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  C,
  title,
  children,
}: {
  C: ReturnType<typeof useThemeColors>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.text }]}>{title}</Text>
      <Text style={[styles.sectionBody, { color: C.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    minWidth: 64,
    paddingVertical: Spacing.xs,
  },
  backText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  updated: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  sectionBody: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
});
