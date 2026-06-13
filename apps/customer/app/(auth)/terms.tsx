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
import { useThemeColors, Spacing, FontSize, Radius } from '@pastacim/shared';

export default function TermsScreen() {
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
        <Text style={[styles.headerTitle, { color: C.primary }]}>Kullanım Koşulları</Text>
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

        <Section C={C} title="1. Hizmet Tanımı">
          Pastacım, müşterilerin pasta/tatlı/börek siparişi oluşturduğu; yakınlarındaki pastacıların bu siparişlere teklif verdiği bir aracı platformdur.
        </Section>

        <Section C={C} title="2. Hesap Koşulları">
          {`• Gerçek ve güncel bilgilerle kayıt olmanız zorunludur.
• Hesap güvenliğiniz sizin sorumluluğunuzdadır.
• Bir hesap birden fazla kişi tarafından kullanılamaz.`}
        </Section>

        <Section C={C} title="3. Müşteri Yükümlülükleri">
          {`• Sipariş oluştururken gerçek ve eksiksiz bilgi verilmelidir.
• Kabul edilen teklif için pastacıyla iyi niyetli iletişim kurulmalıdır.
• Sipariş iptallerinde pastacı bildirilmelidir.`}
        </Section>

        <Section C={C} title="4. Pastacı Yükümlülükleri">
          {`• Yalnızca gerçekçi ve yerine getirebileceğiniz teklifler veriniz.
• Kabul edilen siparişleri belirlenen sürede teslim etmeye çalışınız.
• Dükkan profilinizde güncel ve doğru bilgilere yer veriniz.`}
        </Section>

        <Section C={C} title="5. Yasaklı Kullanımlar">
          {`• Platform üzerinden yanıltıcı, sahte veya yasadışı içerik paylaşmak
• Diğer kullanıcıları taciz etmek veya spam göndermek
• Uygulamanın güvenlik önlemlerini aşmaya çalışmak`}
        </Section>

        <Section C={C} title="6. Sorumluluk Sınırı">
          Platform, aracı konumundadır. Müşteri ile pastacı arasındaki ticari anlaşmazlıklarda platform doğrudan taraf değildir.
        </Section>

        <Section C={C} title="7. Değişiklikler">
          Koşulları önceden haber vererek değiştirebiliriz.
        </Section>

        <Section C={C} title="8. İletişim">
          anzelpatisserie@gmail.com
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
