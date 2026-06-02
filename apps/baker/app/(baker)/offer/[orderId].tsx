import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Modal, Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, rpcSubmitOffer, notifyUser, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

type Order = Database['public']['Tables']['orders']['Row'];
type Shop = Database['public']['Tables']['pastry_shops']['Row'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

export default function MakeOfferScreen() {
  const C = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyOffered, setAlreadyOffered] = useState(false);
  const [orderClosed, setOrderClosed] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const loadData = useCallback(async (userId: string) => {
    if (!orderId) return;
    setIsLoading(true);
    setShopError(null);

    // Sipariş
    const orderRes = await _db.from('orders').select('*').eq('id', orderId).single();
    if (orderRes.data) setOrder(orderRes.data as Order);

    // Cüzdan bakiyesi
    const walletRes = await _db.from('users').select('wallet_balance').eq('id', userId).single();
    if (walletRes.data) setWalletBalance(Number(walletRes.data.wallet_balance ?? 0));

    // Dükkan
    const shopRes = await _db
      .from('pastry_shops')
      .select('*')
      .eq('user_id', userId);

    if (shopRes.error) {
      setShopError(`DB Hatası: ${shopRes.error.message}`);
    } else if (shopRes.data && shopRes.data.length > 0) {
      setShop(shopRes.data[0] as Shop);
    }

    // Sipariş hâlâ teklif kabul ediyor mu?
    if (orderRes.data && !['pending', 'offers_received'].includes(orderRes.data.status)) {
      setOrderClosed(true);
    }

    // Daha önce teklif verilmiş mi?
    const offerRes = await _db
      .from('offers')
      .select('id')
      .eq('order_id', orderId)
      .eq('baker_id', userId)
      .limit(1);
    if (offerRes.data && offerRes.data.length > 0) setAlreadyOffered(true);

    setIsLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (user?.id) {
      loadData(user.id);
    }
  }, [user?.id, loadData]);

  const handleSubmit = async () => {
    if (!price.trim() || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      Alert.alert('Geçersiz fiyat', 'Lütfen geçerli bir fiyat girin.');
      return;
    }
    if (!shop) {
      Alert.alert('Dükkan Profili Yok', 'Teklif vermek için önce dükkan profilinizi oluşturmanız gerekiyor.');
      return;
    }
    if (!user?.id || !orderId) return;

    setIsSubmitting(true);
    const { data, error } = await rpcSubmitOffer({
      p_order_id: orderId,
      p_price: parseFloat(price),
      p_message: message.trim() || null,
      p_estimated_days: estimatedDays ? parseInt(estimatedDays) : null,
    });
    setIsSubmitting(false);

    if (error) {
      Alert.alert('Hata', 'Teklif gönderilemedi. Lütfen tekrar deneyin.');
      return;
    }
    const rpcError = (data as { error?: string } | null)?.error;
    if (rpcError) {
      if (rpcError === 'siparis_kabul_edildi') {
        setOrderClosed(true);
        Alert.alert('Sipariş Kapatıldı', 'Müşteri bir teklifi kabul etti. Bu siparişe artık teklif verilemez.');
      } else if (rpcError === 'mevcut_teklif' || rpcError.includes('already') || rpcError.includes('mevcut')) {
        setAlreadyOffered(true);
        Alert.alert('Zaten Teklif Verildi', 'Bu sipariş için zaten bir teklifiniz var.');
      } else if (rpcError === 'yetersiz_bakiye' || rpcError.includes('bakiye') || rpcError.includes('balance')) {
        Alert.alert('Yetersiz Bakiye', 'Cüzdanınızda yeterli bakiye bulunmuyor.');
      } else {
        Alert.alert('Hata', rpcError);
      }
      return;
    }

    // Müşteriye bildirim gönder
    if (order?.customer_id) {
      notifyUser({
        userId: order.customer_id,
        type: 'new_offer',
        title: '🎉 Yeni Teklif Aldınız!',
        body: `${shop.name} siparişinize ₺${parseFloat(price)} teklif verdi.`,
        data: { orderId: orderId as string },
      }).catch(() => {});
    }

    router.back();
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

  if (orderClosed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Sipariş Detayı</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48 }}>🔒</Text>
          <Text style={[{ fontSize: 17, fontWeight: '700', color: C.text, marginTop: 12, textAlign: 'center' }]}>
            Sipariş Kapatıldı
          </Text>
          <Text style={[{ fontSize: 14, color: C.textSecondary, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>
            Müşteri bir teklifi kabul etti. Bu siparişe artık teklif verilemez.
          </Text>
          <TouchableOpacity
            style={[{ backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 99, marginTop: 20 }]}
            onPress={() => router.back()}
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>← Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyOffered) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Sipariş Detayı</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.offeredBanner, { backgroundColor: '#48BB7822', borderColor: '#48BB7844' }]}>
            <Text style={[styles.offeredBannerText, { color: '#276749' }]}>
              ✅ Bu sipariş için teklifiniz mevcut
            </Text>
          </View>

          {order && (
            <View style={[styles.orderSummary, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>Sipariş</Text>
              <Text style={[styles.summaryTitle, { color: C.text }]}>{order.title}</Text>
              {order.description && (
                <Text style={[styles.summaryDesc, { color: C.textSecondary }]}>
                  {order.description}
                </Text>
              )}

              {Array.isArray(order.photos) && (order.photos as string[]).length > 0 && (
                <View style={styles.photoSection}>
                  <Text style={[styles.photoLabel, { color: C.textSecondary }]}>Referans Görseller</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.photoScroll}
                    contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 2 }}
                  >
                    {(order.photos as string[]).map((uri, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setFullscreenPhoto(uri)}
                        activeOpacity={0.85}
                      >
                        <Image
                          source={{ uri }}
                          style={[styles.photoThumb, { borderColor: C.border }]}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.summaryMeta}>
                {order.serving_size && (
                  <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                    👥 {order.serving_size} kişilik
                  </Text>
                )}
                {order.delivery_date && (
                  <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                    📅 {new Date(order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                  </Text>
                )}
                <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                  {order.delivery_type === 'delivery' ? '🚚 Teslimat' : '🏪 Gel-Al'}
                </Text>
                {order.delivery_type === 'delivery' && order.delivery_address ? (
                  <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                    📍 {order.delivery_address}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {order?.customer_id && (
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.primary }]}
              onPress={() => router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId: order.customer_id, orderId: orderId as string },
              })}
            >
              <Text style={styles.submitBtnText}>💬 Müşteriye Mesaj Gönder</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.backBtnFull, { backgroundColor: C.border }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backBtnText, { color: C.text }]}>← Geri Dön</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setFullscreenPhoto(null)}>
            {fullscreenPhoto && (
              <Image source={{ uri: fullscreenPhoto }} style={styles.modalImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setFullscreenPhoto(null)}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  if (!shop) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Teklif Ver</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 56 }}>🏪</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Dükkan Profili Yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Teklif vermek için önce dükkan profilinizi oluşturmanız gerekiyor
          </Text>
          {shopError && (
            <Text style={[styles.emptySubtitle, { color: C.error, fontSize: 11 }]}>
              {shopError}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: C.border, marginTop: 0 }]}
            onPress={() => user?.id && loadData(user.id)}
          >
            <Text style={[styles.backBtnText, { color: C.text }]}>🔄 Yenile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push('/(baker)/profile')}
          >
            <Text style={styles.backBtnText}>Dükkan Profili Oluştur →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Teklif Ver</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {order && (
            <View style={[styles.orderSummary, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>Sipariş</Text>
              <Text style={[styles.summaryTitle, { color: C.text }]}>{order.title}</Text>
              {order.description && (
                <Text style={[styles.summaryDesc, { color: C.textSecondary }]}>
                  {order.description}
                </Text>
              )}

              {Array.isArray(order.photos) && (order.photos as string[]).length > 0 && (
                <View style={styles.photoSection}>
                  <Text style={[styles.photoLabel, { color: C.textSecondary }]}>Referans Görseller</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.photoScroll}
                    contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 2 }}
                  >
                    {(order.photos as string[]).map((uri, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setFullscreenPhoto(uri)}
                        activeOpacity={0.85}
                      >
                        <Image
                          source={{ uri }}
                          style={[styles.photoThumb, { borderColor: C.border }]}
                          onError={() => console.log('Image load error:', uri)}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.summaryMeta}>
                {order.serving_size && (
                  <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                    👥 {order.serving_size} kişilik
                  </Text>
                )}
                {order.delivery_date && (
                  <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                    📅 {new Date(order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                  </Text>
                )}
                <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                  {order.delivery_type === 'delivery' ? '🚚 Teslimat' : '🏪 Gel-Al'}
                </Text>
                {order.delivery_type === 'delivery' && order.delivery_address ? (
                  <Text style={[styles.metaChip, { backgroundColor: C.background, color: C.textSecondary }]}>
                    📍 {order.delivery_address}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          <View style={[styles.shopInfo, { backgroundColor: C.primary + '12', borderColor: C.primary + '33' }]}>
            <Text style={[styles.shopInfoText, { color: C.text }]}>
              🏪 <Text style={{ fontWeight: '700' }}>{shop.name}</Text> adına teklif veriyorsunuz
            </Text>
          </View>

          {/* Cüzdan & Teklif Bedeli */}
          {(() => {
            const offerFee = (order?.serving_size ?? 0) * 5;
            const hasEnough = walletBalance >= offerFee;
            return (
              <View style={[styles.feeCard, {
                backgroundColor: hasEnough ? '#48BB7812' : '#E53E3E12',
                borderColor: hasEnough ? '#48BB7844' : '#E53E3E44',
              }]}>
                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: C.textSecondary }]}>💰 Cüzdan Bakiyesi</Text>
                  <Text style={[styles.feeValue, { color: C.text }]}>
                    ₺{Math.floor(walletBalance).toLocaleString('en-US')}
                  </Text>
                </View>
                <View style={styles.feeDivider} />
                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: C.textSecondary }]}>
                    🎯 Teklif Bedeli
                  </Text>
                  <Text style={[styles.feeValue, { color: '#E53E3E', fontWeight: '800' }]}>
                    -₺{offerFee}
                  </Text>
                </View>
                <View style={styles.feeDivider} />
                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: C.textSecondary }]}>Kalan Bakiye</Text>
                  <Text style={[styles.feeValue, { color: hasEnough ? '#48BB78' : '#E53E3E', fontWeight: '800' }]}>
                    ₺{Math.floor(walletBalance - offerFee).toLocaleString('en-US')}
                  </Text>
                </View>
                {!hasEnough && (
                  <Text style={styles.feeWarning}>
                    ⚠️ Yetersiz bakiye. Cüzdanınıza ₺{offerFee - Math.floor(walletBalance)} daha yükleyin.
                  </Text>
                )}
              </View>
            );
          })()}

          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Fiyat (₺) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Örn: 1500"
              placeholderTextColor={C.placeholder}
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Müşteriye Mesajınız</Text>
            <TextInput
              style={[styles.inputMulti, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Kendinizi ve teklifinizi tanıtın, referanslarınızdan bahsedin..."
              placeholderTextColor={C.placeholder}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={[styles.charCount, { color: C.placeholder }]}>{message.length}/500</Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: C.primary }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                🎉 Teklif Gönder · ₺{(order?.serving_size ?? 0) * 5}
              </Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFullscreenPhoto(null)}>
          {fullscreenPhoto && (
            <Image source={{ uri: fullscreenPhoto }} style={styles.modalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setFullscreenPhoto(null)}>
            <Text style={styles.modalCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  backText: { fontSize: FontSize.md, fontWeight: '600' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  backBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 12, borderRadius: Radius.full },
  backBtnFull: { paddingVertical: 14, borderRadius: Radius.full, alignItems: 'center' },
  backBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  offeredBanner: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  offeredBannerText: { fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  orderSummary: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryTitle: { fontSize: FontSize.md, fontWeight: '700' },
  summaryDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  summaryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  metaChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm, fontSize: FontSize.xs },
  shopInfo: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  shopInfoText: { fontSize: FontSize.sm },
  feeCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeLabel: { fontSize: FontSize.sm, flex: 1, flexWrap: 'wrap' },
  feeValue: { fontSize: FontSize.sm, fontWeight: '700', marginLeft: Spacing.sm },
  feeDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 2 },
  feeWarning: { fontSize: FontSize.xs, color: '#E53E3E', fontWeight: '600', marginTop: Spacing.xs },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
  },
  inputSmall: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
    alignSelf: 'flex-start', minWidth: 120,
  },
  inputMulti: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 100,
  },
  charCount: { fontSize: FontSize.xs, textAlign: 'right' },
  submitBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  photoSection: { gap: Spacing.xs, marginTop: Spacing.xs },
  photoLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  photoScroll: { height: 110 },
  photoThumb: { width: 100, height: 100, borderRadius: Radius.md, marginRight: Spacing.sm, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '95%', height: '80%' },
  modalCloseBtn: {
    position: 'absolute', top: 56, right: 20,
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
