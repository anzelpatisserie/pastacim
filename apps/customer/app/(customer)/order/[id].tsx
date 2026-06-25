import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Image, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase, rpcCancelOrder, notifyUser, useAuth, useThemeColors, Spacing, Radius, FontSize, ReportModal, openAddressInMaps } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type Order = Database['public']['Tables']['orders']['Row'];

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  pending:         { label: 'Teklif Bekleniyor',   color: '#F5A623', emoji: '⏳' },
  offers_received: { label: 'Teklif Geldi',        color: '#48BB78', emoji: '🎉' },
  accepted:        { label: 'Kabul Edildi',         color: '#4299E1', emoji: '✅' },
  in_progress:     { label: 'Hazırlanıyor',         color: '#9F7AEA', emoji: '👨‍🍳' },
  ready:           { label: 'Teslimata Hazır!',     color: '#E53E3E', emoji: '📦' },
  completed:       { label: 'Tamamlandı',           color: '#68D391', emoji: '🎂' },
  cancelled:       { label: 'İptal Edildi',         color: '#FC8181', emoji: '❌' },
};

type AcceptedOffer = {
  id: string;
  baker_id: string;
  price: number;
  shop: { id: string; name: string; rating: number } | null;
};

export default function OrderDetailScreen() {
  const C = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [offerCount, setOfferCount] = useState(0);
  const [acceptedOffer, setAcceptedOffer] = useState<AcceptedOffer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);

    // Siparişi yükle
    const orderRes = await _db.from('orders').select('*').eq('id', id).single();
    if (orderRes.data) {
      const ord = orderRes.data as Order;
      setOrder(ord);

      // Teklif sayısı
      const offerRes = await _db
        .from('offers')
        .select('id, baker_id, price, shop:pastry_shops!shop_id(id, name, rating)')
        .eq('order_id', id)
        .neq('status', 'rejected');

      const rows = (offerRes.data ?? []) as (AcceptedOffer & { status: string })[];
      setOfferCount(rows.length);

      // Kabul edilen teklif — selected_offer_id yoksa MUTLAKA null'a sıfırla
      // (ekran aynı rota olduğu için başka siparişin teklifi state'te kalıyordu).
      const accepted = ord.selected_offer_id
        ? (rows.find((r) => r.id === ord.selected_offer_id) ?? null)
        : null;
      setAcceptedOffer(accepted);
    } else {
      setOrder(null);
      setAcceptedOffer(null);
    }

    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    if (user?.id) fetchData();
    else setIsLoading(false);
  }, [user?.id, fetchData]);

  // Tab'a / sayfaya her dönüşte veriyi tazele
  useFocusEffect(useCallback(() => {
    if (user?.id) fetchData();
  }, [user?.id, fetchData]));

  // Realtime: sipariş durumu değişince anında güncelle
  const orderRef = useRef<Order | null>(null);
  orderRef.current = order;

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`order-detail:${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => {
          // Herhangi bir güncelleme → tüm veriyi yenile
          fetchData();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  const handleCancel = () => {
    if (!order) return;
    const isAccepted = order.status === 'accepted' || order.status === 'in_progress';
    Alert.alert(
      '🗑️ Siparişi İptal Et',
      isAccepted
        ? `"${order.title}" siparişi zaten kabul edildi. İptal etmek istediğinden emin misin? Pastacı bilgilendirilecek.`
        : `"${order.title}" siparişini iptal etmek istediğinden emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et', style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            const { data, error } = await rpcCancelOrder({ p_order_id: order.id });
            setIsCancelling(false);
            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', 'Sipariş iptal edilemedi. Lütfen tekrar deneyin.');
              return;
            }
            setOrder((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    if (!order) return;
    Alert.alert(
      '🎂 Siparişi Tamamla',
      `"${order.title}" siparişini teslim aldın mı? Bu işlem geri alınamaz.`,
      [
        { text: 'Hayır', style: 'cancel' },
        {
          text: 'Evet, Teslim Aldım',
          onPress: async () => {
            setIsCompleting(true);
            const { error } = await _db
              .from('orders')
              .update({ status: 'completed' })
              .eq('id', order.id)
              .eq('customer_id', user!.id);
            setIsCompleting(false);

            if (error) {
              Alert.alert('Hata', 'Sipariş tamamlanamadı.');
              return;
            }

            // Pastacıya bildirim
            if (order.selected_offer_id) {
              _db.from('offers')
                .select('baker_id')
                .eq('id', order.selected_offer_id)
                .single()
                .then(({ data: od }: { data: { baker_id: string } | null }) => {
                  if (od?.baker_id) {
                    notifyUser({
                      userId: od.baker_id,
                      type: 'order_completed',
                      title: '🎂 Sipariş Tamamlandı!',
                      body: `"${order.title}" siparişi müşteri tarafından teslim alındı.`,
                      data: { orderId: order.id },
                    }).catch(() => {});
                  }
                })
                .catch(() => {});
            }

            router.replace({ pathname: '/(customer)/review/[orderId]', params: { orderId: order.id } });
          },
        },
      ]
    );
  };

  // Pastacı "teslim ettim" yaptıysa ama müşteri almadıysa: statüyü geri al.
  const handleRevert = () => {
    if (!order) return;
    Alert.alert(
      '↩️ Teslim Almadım',
      `"${order.title}" siparişini henüz teslim almadıysan durumu "Teslimata Hazır"a geri alabilirsin. Pastacı bilgilendirilecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Geri Al', style: 'destructive',
          onPress: async () => {
            setIsReverting(true);
            const { error } = await _db
              .from('orders')
              .update({ status: 'ready' })
              .eq('id', order.id)
              .eq('customer_id', user!.id);
            setIsReverting(false);
            if (error) {
              Alert.alert('Hata', 'Durum geri alınamadı.');
              return;
            }
            setOrder((prev) => prev ? { ...prev, status: 'ready' } : prev);
            if (order.selected_offer_id) {
              _db.from('offers')
                .select('baker_id')
                .eq('id', order.selected_offer_id)
                .single()
                .then(({ data: od }: { data: { baker_id: string } | null }) => {
                  if (od?.baker_id) {
                    notifyUser({
                      userId: od.baker_id,
                      type: 'order_reverted',
                      title: '↩️ Sipariş Teslim Alınmadı',
                      body: `"${order.title}" siparişini müşteri henüz teslim almadığını bildirdi.`,
                      data: { orderId: order.id },
                    }).catch(() => {});
                  }
                })
                .catch(() => {});
            }
          },
        },
      ]
    );
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

  if (!order) {
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
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 40 }}>❓</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Sipariş bulunamadı</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConf = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['pending'];
  const photos = Array.isArray(order.photos) ? (order.photos as string[]) : [];
  const canViewOffers   = ['pending', 'offers_received', 'accepted', 'in_progress', 'ready'].includes(order.status) && offerCount > 0;
  const canComplete     = ['accepted', 'in_progress', 'ready'].includes(order.status);
  const canCancel       = ['pending', 'offers_received', 'accepted'].includes(order.status);
  const isReady         = order.status === 'ready';
  const isDone          = order.status === 'completed' || order.status === 'cancelled';
  const hasAcceptedBaker = !!acceptedOffer;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]}>Sipariş Detayı</Text>
        <TouchableOpacity
          onPress={() => setShowReport(true)}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
          style={{ width: 48, alignItems: 'flex-end' }}
        >
          <Text style={{ fontSize: 18 }}>⚠️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Durum Badge */}
        <View style={[styles.statusCard, { backgroundColor: statusConf.color + '18', borderColor: statusConf.color + '44' }]}>
          <Text style={[styles.statusText, { color: statusConf.color }]}>
            {statusConf.emoji} {statusConf.label}
          </Text>
          {!isDone && ['pending', 'offers_received'].includes(order.status) && offerCount > 0 && (
            <Text style={[styles.offerCountBadge, { color: statusConf.color }]}>
              {offerCount} teklif
            </Text>
          )}
        </View>

        {/* Sipariş Bilgileri */}
        <View style={[styles.detailCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.orderTitle, { color: C.text }]}>{order.title}</Text>

          {order.description ? (
            <Text style={[styles.orderDesc, { color: C.textSecondary }]}>{order.description}</Text>
          ) : null}

          {/* Referans Görseller */}
          {photos.length > 0 && (
            <View style={styles.photoSection}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>Referans Görseller</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: Spacing.sm }}
              >
                {photos.map((uri, idx) => (
                  <TouchableOpacity key={idx} onPress={() => setFullscreenPhoto(uri)} activeOpacity={0.85}>
                    <Image
                      source={{ uri }}
                      style={[styles.photoThumb, { borderColor: C.border }]}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Meta bilgiler */}
          <View style={styles.metaGrid}>
            {order.serving_size ? (
              <View style={[styles.metaItem, { backgroundColor: C.background }]}>
                <Text style={styles.metaEmoji}>👥</Text>
                <Text style={[styles.metaValue, { color: C.text }]}>{order.serving_size} kişilik</Text>
              </View>
            ) : null}
            {order.delivery_date ? (
              <View style={[styles.metaItem, { backgroundColor: C.background }]}>
                <Text style={styles.metaEmoji}>📅</Text>
                <Text style={[styles.metaValue, { color: C.text }]}>
                  {new Date(order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            ) : null}
            <View style={[styles.metaItem, { backgroundColor: C.background }]}>
              <Text style={styles.metaEmoji}>{order.delivery_type === 'delivery' ? '🚚' : '🏪'}</Text>
              <Text style={[styles.metaValue, { color: C.text }]}>
                {order.delivery_type === 'delivery' ? 'Adrese Teslim' : 'Gel-Al'}
              </Text>
            </View>
            {order.delivery_type === 'delivery' && order.delivery_address ? (
              <TouchableOpacity
                style={[styles.metaItem, { backgroundColor: C.background }]}
                onPress={() => openAddressInMaps(order.delivery_address, order.delivery_latitude ?? order.latitude, order.delivery_longitude ?? order.longitude)}
                activeOpacity={0.6}
              >
                <Text style={styles.metaEmoji}>📍</Text>
                <Text style={[styles.metaValue, { color: C.primary }]}>{order.delivery_address} ›</Text>
              </TouchableOpacity>
            ) : null}
            {order.created_at ? (
              <View style={[styles.metaItem, { backgroundColor: C.background }]}>
                <Text style={styles.metaEmoji}>🗓</Text>
                <Text style={[styles.metaValue, { color: C.text }]}>
                  {new Date(order.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Kabul edilen pastacı bilgisi */}
        {hasAcceptedBaker && acceptedOffer && (
          <View style={[styles.bakerCard, { backgroundColor: C.card, borderColor: C.success + '55' }]}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>Pastacı</Text>
            <TouchableOpacity
              style={styles.bakerRow}
              activeOpacity={0.6}
              disabled={!acceptedOffer.shop?.id}
              onPress={() => acceptedOffer.shop?.id && router.push({
                pathname: '/(customer)/baker/[shopId]',
                params: { shopId: acceptedOffer.shop.id },
              })}
            >
              <View style={[styles.bakerAvatar, { backgroundColor: C.primary + '22' }]}>
                <Text style={{ fontSize: 22 }}>🎂</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bakerName, { color: C.text }]}>
                  {acceptedOffer.shop?.name ?? 'Pastacı'} ›
                </Text>
                {(acceptedOffer.shop?.rating ?? 0) > 0 && (
                  <Text style={[styles.bakerRating, { color: C.textSecondary }]}>
                    ⭐ {(acceptedOffer.shop?.rating ?? 0).toFixed(1)}
                  </Text>
                )}
              </View>
              <Text style={[styles.acceptedPrice, { color: C.primary }]}>₺{acceptedOffer.price}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Aksiyon Butonları */}
        <View style={styles.actions}>
          {/* Teklifleri Gör */}
          {canViewOffers && (
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: C.primary }]}
              onPress={() => router.push({ pathname: '/(customer)/offers/[orderId]', params: { orderId: order.id } })}
            >
              <Text style={styles.btnPrimaryText}>
                {['accepted', 'in_progress', 'ready'].includes(order.status)
                  ? '✅ Teklif Detayını Gör →'
                  : `🎉 ${offerCount} Teklifi İncele →`}
              </Text>
            </TouchableOpacity>
          )}

          {/* Pastacıya Mesaj */}
          {hasAcceptedBaker && acceptedOffer && (
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: C.primary + '66', backgroundColor: C.primary + '12' }]}
              onPress={() => router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId: acceptedOffer.baker_id, orderId: order.id },
              })}
            >
              <Text style={[styles.btnOutlineText, { color: C.primary }]}>💬 Pastacıya Mesaj Gönder</Text>
            </TouchableOpacity>
          )}

          {/* Teslim Aldım */}
          {canComplete && (
            <TouchableOpacity
              style={[styles.btnComplete, { backgroundColor: isReady ? '#E53E3E' : '#48BB78' }]}
              onPress={handleComplete}
              disabled={isCompleting}
            >
              {isCompleting
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.btnCompleteText}>
                    {isReady ? '🔔 Teslim Aldım!' : '🎂 Tamamla'}
                  </Text>
              }
            </TouchableOpacity>
          )}

          {/* İptal Et */}
          {canCancel && (
            <TouchableOpacity
              style={[styles.btnCancel, { borderColor: C.error + '88' }]}
              onPress={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling
                ? <ActivityIndicator color={C.error} size="small" />
                : <Text style={[styles.btnCancelText, { color: C.error }]}>🗑️ Siparişi İptal Et</Text>
              }
            </TouchableOpacity>
          )}

          {/* Teslim Almadım — pastacı completed yaptıysa geri al */}
          {order.status === 'completed' && (
            <TouchableOpacity
              style={[styles.btnCancel, { borderColor: C.error + '88' }]}
              onPress={handleRevert}
              disabled={isReverting}
            >
              {isReverting
                ? <ActivityIndicator color={C.error} size="small" />
                : <Text style={[styles.btnCancelText, { color: C.error }]}>↩️ Teslim Almadım (Geri Al)</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Tam Ekran Görsel Modal */}
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

      {/* Şikayet Et */}
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        targetType="order"
        targetId={id}
        appName="customer"
      />
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
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },

  content: { padding: Spacing.md, gap: Spacing.md },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  statusText: { fontSize: FontSize.md, fontWeight: '700' },
  offerCountBadge: { fontSize: FontSize.sm, fontWeight: '700' },

  detailCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  orderTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  orderDesc: { fontSize: FontSize.sm, lineHeight: 20 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  photoSection: { gap: Spacing.xs },
  photoThumb: { width: 110, height: 110, borderRadius: Radius.md, borderWidth: 1 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  metaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.sm,
  },
  metaEmoji: { fontSize: 14 },
  metaValue: { fontSize: FontSize.sm, fontWeight: '500' },

  bakerCard: { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  bakerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bakerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bakerName: { fontSize: FontSize.md, fontWeight: '700' },
  bakerRating: { fontSize: FontSize.xs },
  acceptedPrice: { fontSize: FontSize.xl, fontWeight: '800' },

  actions: { gap: Spacing.sm },
  btnPrimary: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center',
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  btnPrimaryText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  btnOutline: { paddingVertical: 14, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  btnOutlineText: { fontSize: FontSize.sm, fontWeight: '700' },
  btnComplete: { paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center' },
  btnCompleteText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  btnCancel: { paddingVertical: 12, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  btnCancelText: { fontSize: FontSize.sm, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '95%', height: '80%' },
  modalCloseBtn: {
    position: 'absolute', top: 56, right: 20, width: 40, height: 40,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
