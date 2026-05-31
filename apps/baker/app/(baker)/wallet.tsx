import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { supabase, rpcAddWalletBalance, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

type WalletTransaction = Database['public']['Tables']['wallet_transactions']['Row'];

const PRESET_AMOUNTS = [50, 100, 200, 500];

export default function WalletScreen() {
  const C = useThemeColors();
  const { user } = useAuth();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isTopUpLoading, setIsTopUpLoading] = useState(false);

  // Kredi kartı alanları (simülasyon)
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [showCardForm, setShowCardForm] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    const { data: profileData } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', user.id)
      .single() as { data: { wallet_balance: number } | null; error: unknown };

    setBalance(profileData?.wallet_balance ?? 0);

    const { data: txData } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setTransactions((txData ?? []) as WalletTransaction[]);

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getAmount = (): number | null => {
    if (selectedAmount) return selectedAmount;
    const parsed = parseInt(customAmount.replace(/\D/g, ''), 10);
    return isNaN(parsed) || parsed < 10 ? null : parsed;
  };

  const handleTopUp = async () => {
    const amount = getAmount();
    if (!amount) {
      Alert.alert('Geçersiz Tutar', 'Lütfen en az ₺10 yükleyin.');
      return;
    }
    if (!cardNumber.replace(/\s/g, '') || cardNumber.replace(/\s/g, '').length < 16) {
      Alert.alert('Kart Bilgisi', 'Lütfen geçerli bir kart numarası girin.');
      return;
    }
    if (!cardExpiry || cardExpiry.length < 5) {
      Alert.alert('Kart Bilgisi', 'Lütfen son kullanma tarihini girin (AA/YY).');
      return;
    }
    if (!cardCvv || cardCvv.length < 3) {
      Alert.alert('Kart Bilgisi', 'Lütfen CVV kodunu girin.');
      return;
    }

    Alert.alert(
      '💳 Ödemeyi Onayla',
      `₺${amount} yüklenecek. Onaylıyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            setIsTopUpLoading(true);
            const { data, error } = await rpcAddWalletBalance({ p_amount: amount });
            setIsTopUpLoading(false);

            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', (data as { error?: string } | null)?.error ?? 'Yükleme başarısız.');
              return;
            }

            const newBalance = (data as { new_balance?: number } | null)?.new_balance ?? (balance + amount);
            setBalance(newBalance);
            setSelectedAmount(null);
            setCustomAmount('');
            setCardNumber('');
            setCardExpiry('');
            setCardCvv('');
            setCardName('');
            setShowCardForm(false);
            fetchData();

            Alert.alert('✅ Yükleme Başarılı', `₺${amount} cüzdanınıza eklendi. Yeni bakiye: ₺${newBalance}`);
          },
        },
      ]
    );
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 16);
    return cleaned.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 3) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return cleaned;
  };

  const txTypeLabel = (type: WalletTransaction['type']): { label: string; color: string } => {
    switch (type) {
      case 'top_up':    return { label: '⬆️ Yükleme',       color: '#48BB78' };
      case 'offer_fee': return { label: '🎯 Teklif Ücreti',  color: '#E53E3E' };
      case 'refund':    return { label: '↩️ İade',            color: '#4299E1' };
      default:          return { label: String(type),        color: '#718096' };
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const topUpAmount = getAmount();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Text style={[styles.title, { color: C.text }]}>Cüzdanım</Text>
        </View>

        {/* Bakiye Kartı */}
        <View style={[styles.balanceCard, { backgroundColor: C.primary }]}>
          <Text style={styles.balanceLabel}>Kullanılabilir Bakiye</Text>
          <Text style={styles.balanceAmount}>₺{Math.floor(Number(balance)).toLocaleString('en-US')}</Text>
          <Text style={styles.balanceNote} />
        </View>

        {/* Hızlı Yükle */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>💳 Bakiye Yükle</Text>

          <View style={styles.presetRow}>
            {PRESET_AMOUNTS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[
                  styles.presetBtn,
                  {
                    backgroundColor: selectedAmount === amt ? C.primary : C.card,
                    borderColor: selectedAmount === amt ? C.primary : C.border,
                  },
                ]}
                onPress={() => { setSelectedAmount(amt); setCustomAmount(''); }}
              >
                <Text style={[
                  styles.presetBtnText,
                  { color: selectedAmount === amt ? '#FFF' : C.text },
                ]}>
                  ₺{amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[styles.customInput, { backgroundColor: C.card, borderColor: selectedAmount ? C.border : (customAmount ? C.primary : C.border), color: C.text }]}
            placeholder="Özel tutar girin (₺)"
            placeholderTextColor={C.placeholder}
            value={customAmount}
            onChangeText={(t) => { setCustomAmount(t.replace(/\D/g, '')); setSelectedAmount(null); }}
            keyboardType="number-pad"
            maxLength={6}
          />

          {(selectedAmount || customAmount) ? (
            <TouchableOpacity
              style={[styles.showCardBtn, { borderColor: C.border }]}
              onPress={() => setShowCardForm((v) => !v)}
            >
              <Text style={[styles.showCardBtnText, { color: C.primary }]}>
                {showCardForm ? '▲ Kart Bilgisini Gizle' : '▼ Kart Bilgisi Gir'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {showCardForm && (
            <View style={[styles.cardForm, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.cardFormTitle, { color: C.text }]}>Kart Bilgileri</Text>

              <View style={styles.cardField}>
                <Text style={[styles.cardLabel, { color: C.textSecondary }]}>Kart Üzerindeki İsim</Text>
                <TextInput
                  style={[styles.cardInput, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="AD SOYAD"
                  placeholderTextColor={C.placeholder}
                  value={cardName}
                  onChangeText={(t) => setCardName(t.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.cardField}>
                <Text style={[styles.cardLabel, { color: C.textSecondary }]}>Kart Numarası</Text>
                <TextInput
                  style={[styles.cardInput, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor={C.placeholder}
                  value={cardNumber}
                  onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                  keyboardType="number-pad"
                  maxLength={19}
                />
              </View>

              <View style={styles.cardRow}>
                <View style={[styles.cardField, { flex: 1 }]}>
                  <Text style={[styles.cardLabel, { color: C.textSecondary }]}>Son Kullanma</Text>
                  <TextInput
                    style={[styles.cardInput, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                    placeholder="AA/YY"
                    placeholderTextColor={C.placeholder}
                    value={cardExpiry}
                    onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <View style={{ width: Spacing.md }} />
                <View style={[styles.cardField, { flex: 1 }]}>
                  <Text style={[styles.cardLabel, { color: C.textSecondary }]}>CVV</Text>
                  <TextInput
                    style={[styles.cardInput, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                    placeholder="000"
                    placeholderTextColor={C.placeholder}
                    value={cardCvv}
                    onChangeText={(t) => setCardCvv(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={[styles.secureNote, { backgroundColor: C.background }]}>
                <Text style={[styles.secureNoteText, { color: C.textSecondary }]}>
                  🔒 Kart bilgileriniz 256-bit SSL ile şifrelenerek işlenir
                </Text>
              </View>
            </View>
          )}

          {topUpAmount && (
            <TouchableOpacity
              style={[styles.topUpBtn, { backgroundColor: C.primary }]}
              onPress={handleTopUp}
              disabled={isTopUpLoading}
              activeOpacity={0.85}
            >
              {isTopUpLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.topUpBtnText}>₺{topUpAmount} Yükle</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* İşlem Geçmişi */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>📋 İşlem Geçmişi</Text>

          {transactions.length === 0 ? (
            <View style={[styles.emptyTx, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.emptyTxText, { color: C.textSecondary }]}>
                Henüz işlem yok
              </Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const { label, color } = txTypeLabel(tx.type);
              const isPositive = tx.amount > 0;
              return (
                <View key={tx.id} style={[styles.txItem, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txLabel, { color: C.text }]}>{label}</Text>
                    {tx.description && (
                      <Text style={[styles.txDesc, { color: C.textSecondary }]} numberOfLines={1}>
                        {tx.description}
                      </Text>
                    )}
                    <Text style={[styles.txDate, { color: C.placeholder }]}>
                      {new Date(tx.created_at).toLocaleDateString('tr-TR', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, { color: color }]}>
                    {isPositive ? '+' : ''}₺{Number(tx.amount).toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  balanceCard: {
    margin: Spacing.lg, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.xs,
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, fontWeight: '500' },
  balanceAmount: { color: '#FFF', fontSize: 48, fontWeight: '800' },
  balanceNote: { color: 'rgba(255,255,255,0.0)', fontSize: FontSize.xs, marginTop: 4 },
  section: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.xs },
  presetRow: { flexDirection: 'row', gap: Spacing.sm },
  presetBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, alignItems: 'center',
  },
  presetBtnText: { fontSize: FontSize.md, fontWeight: '700' },
  customInput: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md,
  },
  showCardBtn: {
    borderWidth: 1, borderRadius: Radius.md, paddingVertical: 10,
    alignItems: 'center',
  },
  showCardBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  cardForm: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm,
  },
  cardFormTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.xs },
  cardField: { gap: 4 },
  cardLabel: { fontSize: FontSize.xs, fontWeight: '500' },
  cardInput: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.md,
  },
  cardRow: { flexDirection: 'row' },
  secureNote: { padding: Spacing.sm, borderRadius: Radius.sm, marginTop: Spacing.xs },
  secureNoteText: { fontSize: FontSize.xs, textAlign: 'center' },
  topUpBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center',
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    marginTop: Spacing.xs,
  },
  topUpBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
  emptyTx: {
    padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center',
  },
  emptyTxText: { fontSize: FontSize.sm },
  txItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  txLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  txDesc: { fontSize: FontSize.xs, marginTop: 1 },
  txDate: { fontSize: 10, marginTop: 2 },
  txAmount: { fontSize: FontSize.md, fontWeight: '800' },
});
