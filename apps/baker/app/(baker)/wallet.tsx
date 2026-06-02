import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, ActivityIndicator, Alert,
  Modal, Clipboard, Pressable,
} from 'react-native';
import { supabase, rpcRequestWalletTopUp, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

type WalletTransaction = Database['public']['Tables']['wallet_transactions']['Row'];
type TopUpRequest = Database['public']['Tables']['wallet_top_up_requests']['Row'];

const PRESET_AMOUNTS = [50, 100, 200, 500];

// Havale bilgileri — gerçek IBAN ve ad/soyadı buraya girin
const IBAN_INFO = {
  iban: 'TR00 0000 0000 0000 0000 0000 00',
  name: 'Anzel Pastisserie',
  bank: 'Ziraat Bankası',
};

export default function WalletScreen() {
  const C = useThemeColors();
  const { user } = useAuth();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TopUpRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showIbanModal, setShowIbanModal] = useState(false);
  const [modalAmount, setModalAmount] = useState<number>(0);
  const [sentConfirmed, setSentConfirmed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    const [profileRes, txRes, reqRes] = await Promise.all([
      supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', user.id)
        .single() as unknown as Promise<{ data: { wallet_balance: number } | null; error: unknown }>,
      supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('wallet_top_up_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    setBalance(profileRes.data?.wallet_balance ?? 0);
    setTransactions((txRes.data ?? []) as WalletTransaction[]);
    setPendingRequests((reqRes.data ?? []) as TopUpRequest[]);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Bakiye ve talep durumu değişince otomatik güncelle
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`wallet:${user.id}:${Date.now()}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as { wallet_balance: number };
          if (updated.wallet_balance !== undefined) setBalance(updated.wallet_balance);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallet_top_up_requests', filter: `user_id=eq.${user.id}` },
        () => fetchData()
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        () => fetchData()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchData]);

  const getAmount = (): number | null => {
    if (selectedAmount) return selectedAmount;
    const parsed = parseInt(customAmount.replace(/\D/g, ''), 10);
    return isNaN(parsed) || parsed < 10 ? null : parsed;
  };

  const handleYukle = () => {
    const amount = getAmount();
    if (!amount) {
      Alert.alert('Geçersiz Tutar', 'Lütfen en az ₺10 tutarında bir miktar seçin.');
      return;
    }
    setModalAmount(amount);
    setSentConfirmed(false);
    setShowIbanModal(true);
  };

  const referenceCode = user?.id ? user.id.replace(/-/g, '').slice(-8).toUpperCase() : '';

  const copyIban = () => {
    Clipboard.setString(IBAN_INFO.iban.replace(/\s/g, ''));
    Alert.alert('Kopyalandı', 'IBAN numarası kopyalandı.');
  };

  const handleParayiGonderdim = async () => {
    setIsSubmitting(true);
    const { data, error } = await rpcRequestWalletTopUp({
      p_amount: modalAmount,
      p_note: referenceCode,
    });
    setIsSubmitting(false);

    if (error || (data as { error?: string } | null)?.error) {
      Alert.alert('Hata', 'Talep kaydedilemedi. Lütfen tekrar deneyin.');
      return;
    }

    setSentConfirmed(true);
    fetchData();
  };

  const handleModalKapat = () => {
    setShowIbanModal(false);
    if (sentConfirmed) {
      setSelectedAmount(null);
      setCustomAmount('');
    }
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
        </View>

        {/* Bekleyen Talepler */}
        {pendingRequests.filter(r => r.status === 'pending').length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>⏳ Bekleyen Talepler</Text>
            {pendingRequests.filter(r => r.status === 'pending').map((req) => (
              <View key={req.id} style={[styles.pendingItem, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pendingAmount, { color: '#92400E' }]}>₺{Number(req.amount).toFixed(0)} — Havale Onay Bekliyor</Text>
                  <Text style={[styles.pendingDate, { color: '#92400E' }]}>
                    {new Date(req.created_at).toLocaleDateString('tr-TR', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={{ fontSize: 20 }}>🕐</Text>
              </View>
            ))}
          </View>
        )}

        {/* Bakiye Yükle */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>💳 Bakiye Yükle</Text>
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            Havale ile bakiye yükleyebilirsiniz. Miktar seçip "Yükle" butonuna basın, IBAN bilgilerini göreceksiniz.
          </Text>

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
            style={[styles.customInput, { backgroundColor: C.card, borderColor: customAmount ? C.primary : C.border, color: C.text }]}
            placeholder="Özel tutar girin (₺)"
            placeholderTextColor={C.placeholder}
            value={customAmount}
            onChangeText={(t) => { setCustomAmount(t.replace(/\D/g, '')); setSelectedAmount(null); }}
            keyboardType="number-pad"
            maxLength={6}
          />

          {topUpAmount && (
            <TouchableOpacity
              style={[styles.topUpBtn, { backgroundColor: C.primary }]}
              onPress={handleYukle}
              activeOpacity={0.85}
            >
              <Text style={styles.topUpBtnText}>₺{topUpAmount} Yükle</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* İşlem Geçmişi */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>📋 İşlem Geçmişi</Text>

          {transactions.length === 0 ? (
            <View style={[styles.emptyTx, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.emptyTxText, { color: C.textSecondary }]}>Henüz işlem yok</Text>
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
                  <Text style={[styles.txAmount, { color }]}>
                    {isPositive ? '+' : ''}₺{Number(tx.amount).toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* IBAN Modal */}
      <Modal
        visible={showIbanModal}
        animationType="slide"
        transparent
        onRequestClose={handleModalKapat}
      >
        <Pressable style={styles.modalOverlay} onPress={handleModalKapat}>
          <Pressable style={[styles.modalSheet, { backgroundColor: C.card }]} onPress={() => {}}>
            {!sentConfirmed ? (
              <>
                <Text style={[styles.modalTitle, { color: C.text }]}>🏦 Havale Bilgileri</Text>
                <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
                  Aşağıdaki hesaba ₺{modalAmount} havale yapın, ardından "Parayı Gönderdim" butonuna basın.
                </Text>

                <View style={[styles.ibanBox, { backgroundColor: C.background, borderColor: C.border }]}>
                  <View style={styles.ibanRow}>
                    <Text style={[styles.ibanLabel, { color: C.textSecondary }]}>Banka</Text>
                    <Text style={[styles.ibanValue, { color: C.text }]}>{IBAN_INFO.bank}</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: C.border }]} />
                  <View style={styles.ibanRow}>
                    <Text style={[styles.ibanLabel, { color: C.textSecondary }]}>Ad Soyad</Text>
                    <Text style={[styles.ibanValue, { color: C.text }]}>{IBAN_INFO.name}</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: C.border }]} />
                  <View style={styles.ibanRow}>
                    <Text style={[styles.ibanLabel, { color: C.textSecondary }]}>IBAN</Text>
                    <TouchableOpacity onPress={copyIban} style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={[styles.ibanValue, { color: C.primary }]}>{IBAN_INFO.iban}</Text>
                      <Text style={[styles.copyHint, { color: C.primary }]}>Kopyala</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.divider, { backgroundColor: C.border }]} />
                  <View style={styles.ibanRow}>
                    <Text style={[styles.ibanLabel, { color: C.textSecondary }]}>Tutar</Text>
                    <Text style={[styles.ibanValue, { color: C.text }]}>₺{modalAmount}</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: C.border }]} />
                  <View style={styles.ibanRow}>
                    <Text style={[styles.ibanLabel, { color: C.textSecondary }]}>Açıklama</Text>
                    <TouchableOpacity onPress={() => { Clipboard.setString(referenceCode); Alert.alert('Kopyalandı', 'Referans kodu kopyalandı.'); }} style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={[styles.ibanValue, { color: C.primary }]}>{referenceCode}</Text>
                      <Text style={[styles.copyHint, { color: C.primary }]}>Kopyala</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.noteText, { color: C.textSecondary }]}>
                  Açıklama alanına referans kodunu yazmayı unutmayın. Havale onaylandıktan sonra bakiyenize eklenecektir.
                </Text>

                <TouchableOpacity
                  style={[styles.sentBtn, { backgroundColor: C.primary }]}
                  onPress={handleParayiGonderdim}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.sentBtnText}>✅ Parayı Gönderdim</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleModalKapat} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: C.textSecondary }]}>Henüz Göndermedim</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: C.text }]}>✅ Talebiniz Alındı</Text>
                <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>
                  ₺{modalAmount} tutarındaki havale talebiniz kaydedildi. Havale onaylandıktan sonra bakiyenize otomatik eklenecektir.
                </Text>
                <Text style={[styles.noteText, { color: C.textSecondary, textAlign: 'center' }]}>
                  Onay genellikle aynı iş günü içinde yapılır.
                </Text>
                <TouchableOpacity
                  style={[styles.sentBtn, { backgroundColor: C.primary }]}
                  onPress={handleModalKapat}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sentBtnText}>Tamam</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  section: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.xs },
  infoText: { fontSize: FontSize.sm, lineHeight: 20 },
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
  topUpBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center',
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    marginTop: Spacing.xs,
  },
  topUpBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
  pendingItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  pendingAmount: { fontSize: FontSize.sm, fontWeight: '700' },
  pendingDate: { fontSize: 11, marginTop: 2 },
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
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, gap: Spacing.md,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', textAlign: 'center' },
  modalSubtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  ibanBox: {
    borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden',
    marginVertical: Spacing.xs,
  },
  ibanRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: Spacing.md,
  },
  ibanLabel: { fontSize: FontSize.sm, fontWeight: '500', flex: 0 },
  ibanValue: { fontSize: FontSize.sm, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: Spacing.sm },
  copyHint: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  divider: { height: 1 },
  noteText: { fontSize: FontSize.xs, lineHeight: 18 },
  sentBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center',
    marginTop: Spacing.xs,
  },
  sentBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: FontSize.sm },
});
