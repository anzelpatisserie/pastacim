import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, notifyUser, sendAppEmail, useAuth, useThemeColors, Spacing, Radius, FontSize, TabHeader } from '@pastacim/shared';
import type { Database, ThemeColors } from '@pastacim/shared';
import { useNotifications } from '../../hooks/useNotifications';

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
  cancelled:   { label: 'İptal Edildi',      color: '#FC8181', emoji: '❌' },
};

// Aktif: kabul edilmiş + henüz tamamlanmamış/iptal edilmemiş
function isActive(offer: Offer): boolean {
  const os = offer.order?.status;
  if (offer.status !== 'accepted') return false;
  if (!os) return false;
  return ['accepted', 'in_progress', 'ready'].includes(os);
}

export default function BakerMyOrdersScreen() {
  const C = useThemeColors();
  const { user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progressingId, setProgressingId] = useState<string | null>(null);

  const fetchOffers = useCallback(async (refresh = false) => {
    if (!user?.id) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // Sadece KABUL EDİLMİŞ teklifler — yani üzerinde çalışılan/çalışılmış siparişler
      const { data, error } = await supabase
        .from('offers')
        .select(`
          *,
          order:orders!order_id(
            *,
            customer:users!customer_id(id, full_name)
          )
        `)
        .eq('baker_id', user.id)
        .eq('status', 'accepted')
        .eq('hidden_for_baker', false)
        .order('created_at', { ascending: false });

      if (error) {
        Alert.alert('Hata', 'Siparişler yüklenirken bir sorun oluştu.');
        setOffers([]);
      } else {
        setOffers((data ?? []) as Offer[]);
      }
    } catch {
      Alert.alert('Hata', 'Siparişler yüklenemedi.');
      setOffers([]);
    } finally {
      if (refresh) setIsRefreshing(false);
      else setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchOffers();
    else setIsLoading(false);
  }, [user?.id, fetchOffers]);

  useFocusEffect(useCallback(() => { fetchOffers(); }, [fetchOffers]));

  // Realtime: order status değişiklikleri + offers tablosu (yeni kabul/iptal vs.)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`baker-orders:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const updated = payload.new as { id: string; status: string };
        setOffers((prev) => {
          const exists = prev.some((o) => o.order?.id === updated.id);
          if (!exists) return prev;
          return prev.map((o) =>
            o.order?.id === updated.id
              ? { ...o, order: { ...o.order!, status: updated.status as OrderStatus } }
              : o
          );
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `baker_id=eq.${user.id}` }, () => {
        // Teklif durum değişiklikleri (örn. pending → accepted) için listeyi tazele
        fetchOffers(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchOffers]);

  const handleHide = (offer: Offer) => {
    Alert.alert(
      '🗑️ Listeden Kaldır',
      'Bu teklif Siparişlerim listesinden kaldırılsın mı? Yalnızca sizin görünümünüzden silinir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaldır', style: 'destructive',
          onPress: async () => {
            const { error } = await (supabase as any)
              .rpc('hide_order_for_me', { p_order_id: offer.order?.id });
            if (error) { Alert.alert('Hata', 'Kaldırılamadı.'); return; }
            setOffers((prev) => prev.filter((o) => o.id !== offer.id));
          },
        },
      ]
    );
  };

  const handleSetStatus = async (offer: Offer, newStatus: OrderStatus) => {
    if (!offer.order) return;
    setProgressingId(offer.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('orders')
      .update({ status: newStatus })
      .eq('id', offer.order.id);
    setProgressingId(null);

    if (error) {
      Alert.alert('Hata', error.message ?? 'Durum güncellenemedi.');
      return;
    }

    setOffers((prev) => prev.map((o) =>
      o.id === offer.id && o.order
        ? { ...o, order: { ...o.order, status: newStatus } }
        : o
    ));

    const customerId = offer.order.customer_id;
    if (newStatus === 'in_progress') {
      notifyUser({ userId: customerId, type: 'order_in_progress', title: '🍳 Siparişin Hazırlanıyor!', body: `"${offer.order.title}" siparişin hazırlanmaya başlandı.`, data: { orderId: offer.order.id } }).catch(() => {});
    } else if (newStatus === 'ready') {
      notifyUser({ userId: customerId, type: 'order_ready', title: '📦 Siparişin Teslimata Hazır!', body: `"${offer.order.title}" siparişin teslim almaya hazır.`, data: { orderId: offer.order.id } }).catch(() => {});
      sendAppEmail(customerId, 'order_ready', { orderTitle: offer.order.title });
    } else if (newStatus === 'completed') {
      notifyUser({ userId: customerId, type: 'order_delivered', title: '🎂 Siparişin Teslim Edildi', body: `"${offer.order.title}" siparişin teslim edildi olarak işaretlendi. Teslim almadıysan sipariş kartından geri alabilirsin.`, data: { orderId: offer.order.id } }).catch(() => {});
      sendAppEmail(customerId, 'review_encourage', { orderTitle: offer.order.title });
    }
  };

  const aktif      = offers.filter(isActive);
  // Sadece tamamlanan; iptaller bu listede yer almasın (kabul edilmiş ama customer iptal etti)
  const tamamlanan = offers.filter((o) => o.status === 'accepted' && o.order?.status === 'completed');

  const sections = [
    ...(aktif.length > 0       ? [{ type: 'header' as const, title: `Devam Eden Siparişler (${aktif.length})` }, ...aktif.map((o) => ({ type: 'offer' as const, data: o }))] : []),
    ...(tamamlanan.length > 0  ? [{ type: 'header' as const, title: `Tamamlanan Siparişler (${tamamlanan.length})` }, ...tamamlanan.map((o) => ({ type: 'offer' as const, data: o }))] : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <TabHeader
        title="Siparişlerim"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(baker)/notifications' as never)}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Henüz kabul edilen siparişin yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Kabul edilen teklifleriniz burada görünecek
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
          data={sections}
          keyExtractor={(item, idx) => item.type === 'header' ? `h-${idx}` : item.data.id}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{item.title}</Text>
              );
            }
            return (
              <OfferOrderCard
                offer={item.data}
                colors={C}
                isProgressing={progressingId === item.data.id}
                onHide={() => handleHide(item.data)}
                onSetStatus={(s) => handleSetStatus(item.data, s)}
              />
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchOffers(true)} tintColor={C.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
}

function OfferOrderCard({
  offer, colors: C, isProgressing, onHide, onSetStatus,
}: {
  offer: Offer;
  colors: ThemeColors;
  isProgressing: boolean;
  onHide: () => void;
  onSetStatus: (s: OrderStatus) => void;
}) {
  const isAccepted  = offer.status === 'accepted';
  const orderStatus = offer.order?.status;
  const active      = isActive(offer);

  // Sipariş durumuna göre badge — kabul edilmiş tekliflerde sipariş statüsünü gösterir
  const singleBadge = (() => {
    if (orderStatus === 'cancelled') return ORDER_STATUS_LABELS.cancelled;
    if (isAccepted && orderStatus) return ORDER_STATUS_LABELS[orderStatus];
    return null;
  })();

  const nextAction: { label: string; status: OrderStatus; color: string } | null = (() => {
    if (!isAccepted) return null;
    if (orderStatus === 'accepted')    return { label: '🍳 Hazırlamaya Başla', status: 'in_progress', color: '#9F7AEA' };
    if (orderStatus === 'in_progress') return { label: '📦 Teslimata Hazır',   status: 'ready',       color: '#4299E1' };
    if (orderStatus === 'ready')       return { label: '🎂 Teslim Ettim',      status: 'completed',   color: '#68D391' };
    return null;
  })();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: C.card,
          borderColor: isAccepted && active ? C.success : C.border,
          borderWidth: isAccepted && active ? 2 : 1,
        },
      ]}
      activeOpacity={0.85}
      onPress={() =>
        offer.order?.id &&
        router.push({ pathname: '/(baker)/offer/[orderId]', params: { orderId: offer.order.id } })
      }
    >
      <View style={styles.cardTop}>
        <Text style={[styles.orderTitle, { color: C.text }]} numberOfLines={1}>
          {offer.order?.title ?? 'Sipariş'}
        </Text>
        {singleBadge && (
          <View style={[styles.statusBadge, { backgroundColor: singleBadge.color + '22' }]}>
            <Text style={[styles.statusText, { color: singleBadge.color }]}>
              {'emoji' in singleBadge && singleBadge.emoji ? `${singleBadge.emoji} ` : ''}{singleBadge.label}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.price, { color: C.primary }]}>₺{offer.price}</Text>

      {offer.order?.customer?.full_name && (
        <Text style={[styles.customer, { color: C.textSecondary }]}>
          👤 {offer.order.customer.full_name}
        </Text>
      )}

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

      {offer.order && (
        <View style={styles.btnCol}>
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
            <TouchableOpacity
              style={[styles.msgBtn, { backgroundColor: C.primary, flex: 1 }]}
              onPress={() => router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId: offer.order!.customer_id, orderId: offer.order!.id },
              })}
            >
              <Text style={styles.msgBtnText}>💬 Müşteriye Mesaj</Text>
            </TouchableOpacity>

            {!active && (
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: C.border }]}
                onPress={onHide}
              >
                <Text style={[styles.iconBtnText, { color: C.textSecondary }]}>🗑️</Text>
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
  sectionHeader: { fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.sm, marginBottom: Spacing.xs },
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
  progressBtn: { paddingVertical: 11, borderRadius: Radius.full, alignItems: 'center' },
  progressBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  msgBtn: { paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' },
  msgBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  iconBtn: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  iconBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});
