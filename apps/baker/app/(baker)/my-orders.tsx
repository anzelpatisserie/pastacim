import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, rpcWithdrawOffer, rpcSetOrderStatus, notifyUser, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database, ThemeColors } from '@pastacim/shared';

type Offer = Database['public']['Tables']['offers']['Row'] & {
  order: (Database['public']['Tables']['orders']['Row'] & {
    customer: { id: string; full_name: string | null } | null;
  }) | null;
};

type OrderStatus = Database['public']['Enums']['order_status'];

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  accepted:    { label: 'Kabul Edildi',      color: '#48BB78', emoji: '✅' },
  in_progress: { label: 'Hazırlanıyor',      color: '#9F7AEA', emoji: '👨‍🍳' },
  ready:       { label: 'Teslimata Hazır',   color: '#4299E1', emoji: '📦' },
  completed:   { label: 'Tamamlandı',        color: '#68D391', emoji: '🎂' },
};

export default function BakerMyOrdersScreen() {
  const C = useThemeColors();
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [progressingId, setProgressingId] = useState<string | null>(null);

  const fetchOffers = useCallback(async (refresh = false) => {
    if (!user?.id) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    const { data } = await supabase
      .from('offers')
      .select(`
        *,
        order:orders!order_id(
          *,
          customer:users!customer_id(id, full_name)
        )
      `)
      .eq('baker_id', user.id)
      .in('status', ['accepted', 'pending'])
      .order('created_at', { ascending: false });

    setOffers((data ?? []) as Offer[]);
    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, [user?.id]);

  // Auth hazır olduğunda ilk yükleme (useFocusEffect ile birlikte)
  useEffect(() => {
    if (user?.id) fetchOffers();
    else setIsLoading(false);
  }, [user?.id, fetchOffers]);

  useFocusEffect(useCallback(() => { fetchOffers(); }, [fetchOffers]));

  // ─── Realtime: sipariş durumu değişince anında güncelle ──────────────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`baker-orders:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          // Mevcut listede bu sipariş varsa local state'i güncelle
          setOffers((prev) => {
            const exists = prev.some((o) => o.order?.id === updated.id);
            if (!exists) return prev;
            return prev.map((o) =>
              o.order?.id === updated.id
                ? { ...o, order: { ...o.order!, status: updated.status as OrderStatus } }
                : o
            );
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleWithdraw = (offer: Offer) => {
    const orderTitle = offer.order?.title ?? 'Bu sipariş';
    Alert.alert(
      '↩️ Teklifi Geri Çek',
      `"${orderTitle}" siparişindeki teklifinizi geri çekmek istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Geri Çek', style: 'destructive',
          onPress: async () => {
            setWithdrawingId(offer.id);
            const { data, error } = await rpcWithdrawOffer({ p_offer_id: offer.id });
            setWithdrawingId(null);
            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', 'Teklif geri çekilemedi.');
              return;
            }
            setOffers((prev) => prev.filter((o) => o.id !== offer.id));
            Alert.alert('✅ Teklif Geri Çekildi', 'Teklifiniz başarıyla geri çekildi.');
          },
        },
      ]
    );
  };

  const handleSetStatus = async (offer: Offer, newStatus: OrderStatus) => {
    if (!offer.order) return;
    setProgressingId(offer.id);
    const { data, error } = await rpcSetOrderStatus({
      p_order_id: offer.order.id,
      p_status: newStatus,
    });
    setProgressingId(null);

    if (error || (data as { error?: string } | null)?.error) {
      Alert.alert('Hata', 'Durum güncellenemedi. Lütfen tekrar deneyin.');
      return;
    }

    // Lokal state güncelle
    setOffers((prev) => prev.map((o) =>
      o.id === offer.id && o.order
        ? { ...o, order: { ...o.order, status: newStatus } }
        : o
    ));

    // Müşteriye bildirim gönder
    const customerId = offer.order.customer_id;
    if (newStatus === 'in_progress') {
      notifyUser({
        userId: customerId,
        type: 'order_in_progress',
        title: '🍳 Siparişin Hazırlanıyor!',
        body: `"${offer.order.title}" siparişin hazırlanmaya başlandı.`,
        data: { orderId: offer.order.id },
      }).catch(() => {});
    } else if (newStatus === 'ready') {
      notifyUser({
        userId: customerId,
        type: 'order_ready',
        title: '📦 Siparişin Teslimata Hazır!',
        body: `"${offer.order.title}" siparişin teslim almaya hazır.`,
        data: { orderId: offer.order.id },
      }).catch(() => {});
    }
  };

  const acceptedOffers = offers.filter((o) => o.status === 'accepted');
  const pendingOffers  = offers.filter((o) => o.status === 'pending');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.title, { color: C.text }]}>Siparişlerim</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : acceptedOffers.length === 0 && pendingOffers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Henüz sipariş yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Kabul edilen siparişlerin burada görünür
          </Text>
          <TouchableOpacity
            style={[styles.goBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push('/(baker)')}
          >
            <Text style={styles.goBtnText}>📋 Taleplere Bak →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[...acceptedOffers, ...pendingOffers]}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OfferOrderCard
              offer={item}
              colors={C}
              isWithdrawing={withdrawingId === item.id}
              isProgressing={progressingId === item.id}
              onWithdraw={() => handleWithdraw(item)}
              onSetStatus={(s) => handleSetStatus(item, s)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchOffers(true)} tintColor={C.primary} />
          }
          ListHeaderComponent={
            acceptedOffers.length > 0 ? (
              <Text style={[styles.sectionHeader, { color: C.text }]}>
                ✅ Kabul Edilen ({acceptedOffers.length})
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function OfferOrderCard({
  offer, colors: C, isWithdrawing, isProgressing, onWithdraw, onSetStatus,
}: {
  offer: Offer;
  colors: ThemeColors;
  isWithdrawing: boolean;
  isProgressing: boolean;
  onWithdraw: () => void;
  onSetStatus: (s: OrderStatus) => void;
}) {
  const isAccepted = offer.status === 'accepted';
  const isPending  = offer.status === 'pending';
  const orderStatus = offer.order?.status;

  const statusLabel = orderStatus ? ORDER_STATUS_LABELS[orderStatus] : null;

  // Pastacının yapabileceği sonraki aksiyon
  const nextAction: { label: string; status: OrderStatus; color: string } | null = (() => {
    if (!isAccepted) return null;
    if (orderStatus === 'accepted')    return { label: '🍳 Hazırlamaya Başla', status: 'in_progress', color: '#9F7AEA' };
    if (orderStatus === 'in_progress') return { label: '📦 Teslimata Hazır',   status: 'ready',       color: '#4299E1' };
    return null;
  })();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: C.card, borderColor: isAccepted ? C.success : C.border },
        isAccepted && { borderWidth: 2 },
      ]}
      activeOpacity={0.85}
      onPress={() =>
        offer.order?.id &&
        router.push({ pathname: '/(baker)/offer/[orderId]', params: { orderId: offer.order.id } })
      }
    >
      {/* Başlık + Durum */}
      <View style={styles.cardTop}>
        <Text style={[styles.orderTitle, { color: C.text }]} numberOfLines={1}>
          {offer.order?.title ?? 'Sipariş'}
        </Text>
        {statusLabel && (
          <View style={[styles.statusBadge, { backgroundColor: statusLabel.color + '22' }]}>
            <Text style={[styles.statusText, { color: statusLabel.color }]}>
              {statusLabel.emoji} {statusLabel.label}
            </Text>
          </View>
        )}
      </View>

      {/* Fiyat */}
      <Text style={[styles.price, { color: C.primary }]}>₺{offer.price}</Text>

      {/* Müşteri */}
      {offer.order?.customer?.full_name && (
        <Text style={[styles.customer, { color: C.textSecondary }]}>
          👤 {offer.order.customer.full_name}
        </Text>
      )}

      {/* Detaylar */}
      <View style={styles.metaRow}>
        {offer.order?.serving_size && (
          <Text style={[styles.metaText, { color: C.textSecondary }]}>👥 {offer.order.serving_size} kişilik</Text>
        )}
        {offer.order?.delivery_date && (
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            📅 {new Date(offer.order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
          </Text>
        )}
      </View>

      {/* Aksiyon butonları */}
      {offer.order && (
        <View style={styles.btnCol}>
          {/* Durum geçiş butonu (accepted → in_progress → ready) */}
          {nextAction && (
            <TouchableOpacity
              style={[styles.progressBtn, { backgroundColor: nextAction.color }]}
              onPress={() => onSetStatus(nextAction.status)}
              disabled={isProgressing}
            >
              {isProgressing
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.progressBtnText}>{nextAction.label}</Text>
              }
            </TouchableOpacity>
          )}

          <View style={styles.btnRow}>
            {/* Mesaj */}
            <TouchableOpacity
              style={[styles.msgBtn, { backgroundColor: C.primary, flex: 1 }]}
              onPress={() => router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId: offer.order!.customer_id, orderId: offer.order!.id },
              })}
            >
              <Text style={styles.msgBtnText}>
                {isAccepted ? '💬 Müşteriye Mesaj' : '💬 Mesajlaşmayı Başlat'}
              </Text>
            </TouchableOpacity>

            {/* Geri çek — sadece pending */}
            {isPending && (
              <TouchableOpacity
                style={[styles.withdrawBtn, { borderColor: C.error + '88' }]}
                onPress={onWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing
                  ? <ActivityIndicator size="small" color={C.error} />
                  : <Text style={[styles.withdrawBtnText, { color: C.error }]}>↩️</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  goBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 12, borderRadius: Radius.full, marginTop: Spacing.sm },
  goBtnText: { color: '#FFF', fontWeight: '700' },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  sectionHeader: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.xs },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  orderTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  price: { fontSize: FontSize.xxl, fontWeight: '800' },
  customer: { fontSize: FontSize.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metaText: { fontSize: FontSize.xs },
  btnCol: { gap: Spacing.sm },
  btnRow: { flexDirection: 'row', gap: Spacing.sm },
  progressBtn: {
    paddingVertical: 11, borderRadius: Radius.full, alignItems: 'center',
  },
  progressBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  msgBtn: { paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' },
  msgBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  withdrawBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
    borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center',
  },
  withdrawBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});
