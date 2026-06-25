import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase, rpcSubmitOffer, rpcGetOrderOfferSummary, rpcGetCustomerSummaryForBaker, notifyFromTemplate, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database, OrderOfferSummaryRow, CustomerSummary } from '@pastacim/shared';

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
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyOffered, setAlreadyOffered] = useState(false);
  const [myOfferMessage, setMyOfferMessage] = useState<string | null>(null);
  const [orderClosed, setOrderClosed] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [existingOffers, setExistingOffers] = useState<OrderOfferSummaryRow[]>([]);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);

  const loadData = useCallback(async (userId: string) => {
    if (!orderId) return;
    setIsLoading(true);
    setShopError(null);

    // Sipariş
    const orderRes = await _db.from('orders').select('*').eq('id', orderId).single();
    if (orderRes.data) setOrder(orderRes.data as Order);

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

    // Daha önce AKTİF teklif verilmiş mi? (pending/accepted)
    // rejected/withdrawn ise tekrar teklif verebilir
    const offerRes = await _db
      .from('offers')
      .select('id, status, message')
      .eq('order_id', orderId)
      .eq('baker_id', userId)
      .in('status', ['pending', 'accepted'])
      .limit(1);
    const myActiveOffer = offerRes.data && offerRes.data.length > 0 ? offerRes.data[0] : null;
    // KOŞULSUZ sıfırla — ekran (gizli tab) yeniden kullanıldığı için, teklif geri
    // çekilince (silinince) eski 'mevcut' durumu state'te kalıyordu.
    setAlreadyOffered(!!myActiveOffer);
    setMyOfferMessage(myActiveOffer ? ((myActiveOffer.message as string | null) ?? null) : null);

    // Sipariş kapalı sayılır:
    // - status pending/offers_received DEĞİL VE
    // - baker'ın kabul edilmiş teklifi yok (yani başkasının teklifi kabul edilmiş)
    const closed = !!(orderRes.data
      && !['pending', 'offers_received'].includes(orderRes.data.status)
      && myActiveOffer?.status !== 'accepted');
    setOrderClosed(closed);

    // Bu siparişe verilmiş diğer tekliflerin özetini al (rakip teklifleri görmek için)
    const { data: summary } = await rpcGetOrderOfferSummary(orderId);
    setExistingOffers(summary ?? []);

    // Müşteri özet bilgisi
    const { data: cust } = await rpcGetCustomerSummaryForBaker(orderId);
    setCustomer(cust);

    setIsLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (user?.id) {
      loadData(user.id);
    }
  }, [user?.id, loadData]);

  // Ekrana her döndüğünde fresh data — withdrawn → tekrar teklif vermek için
  useFocusEffect(
    useCallback(() => {
      if (user?.id) loadData(user.id);
    }, [user?.id, loadData])
  );

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
      p_shop_id: shop.id,
      p_price: parseFloat(price),
      p_message: message.trim(),
      // estimated_days UI'de yok; constraint > 0 olduğu için undefined gönder (NULL kalır)
      p_estimated_days: undefined,
    });
    setIsSubmitting(false);

    if (error) {
      console.error('[submit_offer] client error:', error.message, error);
      Alert.alert('Hata', `Teklif gönderilemedi: ${error.message ?? 'bilinmeyen hata'}`);
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
      } else {
        Alert.alert('Hata', rpcError);
      }
      return;
    }

    const trimmedMessage = message.trim();

    // Teklif mesajını müşteriye sohbet mesajı olarak da gönder (offer/[orderId]'de
    // yazılan metin daha önce müşteriye ulaşmıyordu). Yeniden teklifte (rejected →
    // pending) çift kayıt olmaması için aynı içeriğin zaten var olup olmadığını kontrol et.
    if (trimmedMessage && order?.customer_id) {
      try {
        const { data: existing } = await _db
          .from('messages')
          .select('id')
          .eq('order_id', orderId)
          .eq('sender_id', user.id)
          .eq('receiver_id', order.customer_id)
          .eq('content', trimmedMessage)
          .limit(1);
        if (!existing || existing.length === 0) {
          await _db.from('messages').insert({
            order_id:    orderId,
            sender_id:   user.id,
            receiver_id: order.customer_id,
            content:     trimmedMessage,
          });
        }
      } catch {
        // mesaj eklenemese bile teklif akışı devam etsin
      }
    }

    // Müşteriye bildirim gönder (admin-düzenlenebilir şablon)
    if (order?.customer_id) {
      notifyFromTemplate({
        userId: order.customer_id,
        key: 'new_offer',
        vars: { shop: shop.name, price: parseFloat(price) },
        fallback: {
          title: '🎉 Yeni Teklif Aldınız!',
          body: `${shop.name} siparişinize ₺${parseFloat(price)} teklif verdi.`,
        },
        data: { orderId: orderId as string },
        targetRole: 'customer',
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
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
          >
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Sipariş Detayı</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.closedCenter}>
          <View style={[styles.closedCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={styles.closedEmoji}>🔒</Text>
            <Text style={[styles.closedTitle, { color: C.text }]}>Sipariş Kapatıldı</Text>
            <Text style={[styles.closedSubtitle, { color: C.textSecondary }]}>
              Müşteri başka bir teklifi kabul etti.
            </Text>
            <TouchableOpacity
              style={[styles.closedBackBtn, { backgroundColor: C.primary }]}
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.closedBackBtnText}>← Talepler Listesine Dön</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyOffered) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
          >
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Sipariş Detayı</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {(() => {
            const status = order?.status ?? 'pending';
            const map: Record<string, { text: string; bg: string; border: string; fg: string }> = {
              pending:          { text: '✅ Bu sipariş için teklifiniz mevcut', bg: '#48BB7822', border: '#48BB7844', fg: '#276749' },
              offers_received:  { text: '✅ Bu sipariş için teklifiniz mevcut', bg: '#48BB7822', border: '#48BB7844', fg: '#276749' },
              accepted:         { text: '🎉 Teklifiniz kabul edildi',           bg: '#48BB7822', border: '#48BB7844', fg: '#276749' },
              in_progress:      { text: '🛠️ Sipariş hazırlanıyor',              bg: '#F6AD5522', border: '#F6AD5544', fg: '#9C4221' },
              ready:            { text: '📦 Sipariş hazır',                     bg: '#4299E122', border: '#4299E144', fg: '#2C5282' },
              delivered:        { text: '✅ Teslim edildi',                     bg: '#48BB7822', border: '#48BB7844', fg: '#276749' },
              completed:        { text: '✅ Sipariş tamamlandı',                bg: '#48BB7822', border: '#48BB7844', fg: '#276749' },
              cancelled:        { text: '❌ Sipariş iptal edildi',              bg: '#E53E3E22', border: '#E53E3E44', fg: '#9B2C2C' },
            };
            const s = map[status] ?? map.pending;
            return (
              <View style={[styles.offeredBanner, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Text style={[styles.offeredBannerText, { color: s.fg }]}>{s.text}</Text>
              </View>
            );
          })()}

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

          {/* Müşteri özet bilgisi */}
          {customer && (
            <View style={[styles.customerCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.customerHeader}>
                {customer.avatar_url ? (
                  <Image source={{ uri: customer.avatar_url }} style={styles.customerAvatar} />
                ) : (
                  <View style={[styles.customerAvatar, { backgroundColor: C.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 22 }}>👤</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customerName, { color: C.text }]} numberOfLines={1}>
                    {customer.full_name ?? 'Müşteri'}
                  </Text>
                  <Text style={[styles.customerMeta, { color: C.textSecondary }]}>
                    📅 {customer.member_days < 30
                      ? `${customer.member_days} gündür`
                      : customer.member_days < 365
                        ? `${Math.floor(customer.member_days / 30)} aydır`
                        : `${Math.floor(customer.member_days / 365)} yıldır`} Pastacım üyesi
                  </Text>
                </View>
              </View>
              <View style={styles.customerStats}>
                <View style={styles.customerStat}>
                  <Text style={[styles.customerStatNum, { color: C.primary }]}>{customer.total_orders}</Text>
                  <Text style={[styles.customerStatLbl, { color: C.textSecondary }]}>Toplam</Text>
                </View>
                <View style={styles.customerStat}>
                  <Text style={[styles.customerStatNum, { color: '#48BB78' }]}>{customer.completed_orders}</Text>
                  <Text style={[styles.customerStatLbl, { color: C.textSecondary }]}>Tamamlandı</Text>
                </View>
                <View style={styles.customerStat}>
                  <Text style={[styles.customerStatNum, { color: customer.cancelled_orders > 0 ? '#FC8181' : C.textSecondary }]}>
                    {customer.cancelled_orders}
                  </Text>
                  <Text style={[styles.customerStatLbl, { color: C.textSecondary }]}>İptal</Text>
                </View>
              </View>
            </View>
          )}

          {/* Mevcut rakip teklifler — kullanıcı zaten teklif vermiş olsa da görebilsin */}
          {existingOffers.length > 0 && (
            <View style={[styles.offersSection, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.offersTitle, { color: C.text }]}>
                📊 Bu siparişe verilmiş {existingOffers.length} teklif
              </Text>
              <Text style={[styles.offersHint, { color: C.placeholder }]}>
                Puana göre sıralı
              </Text>
              {existingOffers.map((o, i) => (
                <View
                  key={i}
                  style={[
                    styles.offerRow,
                    { borderTopColor: C.border },
                    o.is_mine && { backgroundColor: C.primary + '10', borderLeftWidth: 3, borderLeftColor: C.primary, paddingLeft: Spacing.sm },
                  ]}
                >
                  <View style={[styles.rankBadge, { backgroundColor: o.is_mine ? C.primary + '33' : C.primary + '18' }]}>
                    <Text style={[styles.rankText, { color: C.primary }]}>{i + 1}.</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {o.is_mine && (
                      <Text style={{ fontSize: FontSize.xs, fontWeight: '800', color: C.primary, marginBottom: 2 }}>
                        👤 Sizin teklifiniz
                      </Text>
                    )}
                    <Text style={[styles.offerMeta, { color: C.text }]}>
                      ⭐ {o.shop_rating > 0 ? o.shop_rating.toFixed(1) : '—'}
                      {o.shop_review_count > 0 ? ` (${o.shop_review_count} yorum)` : ''}
                    </Text>
                    {o.is_mine && myOfferMessage ? (
                      <Text style={[styles.offerOwnMessage, { color: C.textSecondary }]}>
                        💬 {myOfferMessage}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.offerPrice, { color: C.primary }]}>
                    {alreadyOffered || o.is_mine ? `₺${o.price}` : '₺•••'}
                  </Text>
                </View>
              ))}
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
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
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
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
          >
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
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
          >
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

          {/* Mevcut rakip teklifler */}
          {existingOffers.length > 0 && (
            <View style={[styles.offersSection, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.offersTitle, { color: C.text }]}>
                📊 Bu siparişe verilmiş {existingOffers.length} teklif
              </Text>
              <Text style={[styles.offersHint, { color: C.placeholder }]}>
                Puana göre sıralı. Fiyatlar teklif verdikten sonra görünür olur.
              </Text>
              {existingOffers.map((o, i) => (
                <View
                  key={i}
                  style={[
                    styles.offerRow,
                    { borderTopColor: C.border },
                    o.is_mine && { backgroundColor: C.primary + '10', borderLeftWidth: 3, borderLeftColor: C.primary, paddingLeft: Spacing.sm },
                  ]}
                >
                  <View style={[styles.rankBadge, { backgroundColor: o.is_mine ? C.primary + '33' : C.primary + '18' }]}>
                    <Text style={[styles.rankText, { color: C.primary }]}>{i + 1}.</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {o.is_mine && (
                      <Text style={{ fontSize: FontSize.xs, fontWeight: '800', color: C.primary, marginBottom: 2 }}>
                        👤 Sizin teklifiniz
                      </Text>
                    )}
                    <Text style={[styles.offerMeta, { color: C.text }]}>
                      ⭐ {o.shop_rating > 0 ? o.shop_rating.toFixed(1) : '—'}
                      {o.shop_review_count > 0 ? ` (${o.shop_review_count} yorum)` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.offerPrice, { color: C.primary }]}>
                    {alreadyOffered || o.is_mine ? `₺${o.price}` : '₺•••'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.shopInfo, { backgroundColor: C.primary + '12', borderColor: C.primary + '33' }]}>
            <Text style={[styles.shopInfoText, { color: C.text }]}>
              🏪 <Text style={{ fontWeight: '700' }}>{shop.name}</Text> adına teklif veriyorsunuz
            </Text>
          </View>

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
                🎉 Teklif Gönder
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
  closedCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  closedCard: {
    width: '100%', maxWidth: 340,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg,
    alignItems: 'center', gap: Spacing.sm,
  },
  closedEmoji: { fontSize: 32 },
  closedTitle: { fontSize: FontSize.md, fontWeight: '700', textAlign: 'center' },
  closedSubtitle: { fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.sm },
  closedBackBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
    borderRadius: Radius.full,
  },
  closedBackBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  orderSummary: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryTitle: { fontSize: FontSize.md, fontWeight: '700' },
  summaryDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  summaryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  offersSection: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
    gap: 4, marginTop: Spacing.sm,
  },
  offersTitle: { fontSize: FontSize.md, fontWeight: '700' },
  offersHint: { fontSize: 11, marginBottom: 4 },
  offerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 10, borderTopWidth: 1, marginTop: 4,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: FontSize.sm, fontWeight: '800' },
  offerMeta: { fontSize: FontSize.sm, fontWeight: '600' },
  offerOwnMessage: { fontSize: FontSize.xs, marginTop: 3, lineHeight: 16, fontStyle: 'italic' },
  offerPrice: { fontSize: FontSize.md, fontWeight: '800' },
  customerCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
    gap: Spacing.md, marginTop: Spacing.sm,
  },
  customerHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  customerAvatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  customerName: { fontSize: FontSize.md, fontWeight: '700' },
  customerMeta: { fontSize: FontSize.xs, marginTop: 2 },
  customerStats: { flexDirection: 'row', gap: Spacing.sm },
  customerStat: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 4,
    alignItems: 'center', borderRadius: Radius.md,
  },
  customerStatNum: { fontSize: FontSize.lg, fontWeight: '800' },
  customerStatLbl: { fontSize: 10, marginTop: 2 },
  metaChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm, fontSize: FontSize.xs },
  shopInfo: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  shopInfoText: { fontSize: FontSize.sm },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
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
