import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, rpcCancelOrder, notifyUser, useAuth, useThemeColors, ThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type Order = Database['public']['Tables']['orders']['Row'];

const STATUS_LABELS: Record<Order['status'], { label: string; color: string; emoji: string }> = {
  pending:         { label: 'Teklif Bekleniyor',   color: '#F5A623', emoji: '⏳' },
  offers_received: { label: 'Teklif Geldi',        color: '#48BB78', emoji: '🎉' },
  accepted:        { label: 'Kabul Edildi',         color: '#4299E1', emoji: '✅' },
  in_progress:     { label: 'Hazırlanıyor',         color: '#9F7AEA', emoji: '👨‍🍳' },
  ready:           { label: 'Teslimata Hazır! 📦',  color: '#E53E3E', emoji: '🔔' },
  completed:       { label: 'Tamamlandı',           color: '#68D391', emoji: '🎂' },
  cancelled:       { label: 'İptal Edildi',         color: '#FC8181', emoji: '❌' },
};

export default function CustomerMyOrdersScreen() {
  const C = useThemeColors();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async (refresh = false) => {
    if (!user?.id) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (supabase as any)
      .from('orders')
      .select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('Siparişler yüklenemedi.');
    } else {
      setOrders(data ?? []);
    }
    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, [user?.id]);

  const handleCancel = (order: Order) => {
    const isAccepted = order.status === 'accepted' || order.status === 'in_progress';
    Alert.alert(
      '🗑️ Siparişi İptal Et',
      isAccepted
        ? `"${order.title}" siparişi zaten kabul edildi. İptal etmek istediğinizden emin misiniz? Pastacı bilgilendirilecek.`
        : `"${order.title}" siparişini iptal etmek istediğinizden emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et', style: 'destructive',
          onPress: async () => {
            setCancellingId(order.id);
            const { data, error } = await rpcCancelOrder({ p_order_id: order.id });
            setCancellingId(null);
            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', 'Sipariş iptal edilemedi. Lütfen tekrar deneyin.');
              return;
            }
            setOrders((prev) => prev.map((o) =>
              o.id === order.id ? { ...o, status: 'cancelled' } : o
            ));
          },
        },
      ]
    );
  };

  const handleDelete = (order: Order) => {
    Alert.alert(
      '🗑️ Siparişi Sil',
      `"${order.title}" siparişini kalıcı olarak silmek istediğinden emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setDeletingId(order.id);
            const { error } = await _db
              .from('orders')
              .delete()
              .eq('id', order.id)
              .eq('customer_id', user.id);
            setDeletingId(null);
            if (error) {
              Alert.alert('Hata', 'Sipariş silinemedi. Lütfen tekrar deneyin.');
              return;
            }
            setOrders((prev) => prev.filter((o) => o.id !== order.id));
          },
        },
      ]
    );
  };

  const handleComplete = (order: Order) => {
    Alert.alert(
      '🎂 Siparişi Tamamla',
      `"${order.title}" siparişini teslim aldınız mı? Bu işlem geri alınamaz.`,
      [
        { text: 'Hayır', style: 'cancel' },
        {
          text: 'Evet, Teslim Aldım',
          onPress: async () => {
            setCompletingId(order.id);
            const { error } = await _db
              .from('orders')
              .update({ status: 'completed' })
              .eq('id', order.id)
              .eq('customer_id', user!.id);
            setCompletingId(null);

            if (error) {
              Alert.alert('Hata', 'Sipariş tamamlanamadı. Lütfen tekrar deneyin.');
              return;
            }

            setOrders((prev) => prev.map((o) =>
              o.id === order.id ? { ...o, status: 'completed' } : o
            ));

            // Kabul edilen teklif sahibi pastacıya bildirim gönder
            if (order.selected_offer_id) {
              _db.from('offers')
                .select('baker_id, shop:pastry_shops!shop_id(name)')
                .eq('id', order.selected_offer_id)
                .single()
                .then(({ data: offerData }: { data: { baker_id: string; shop: { name: string } | null } | null }) => {
                  if (offerData?.baker_id) {
                    notifyUser({
                      userId: offerData.baker_id,
                      type: 'order_completed',
                      title: '🎂 Sipariş Tamamlandı!',
                      body: `"${order.title}" siparişi müşteri tarafından teslim alındı.`,
                      data: { orderId: order.id },
                    }).catch(() => {});
                  }
                })
                .catch(() => {});
            }

            // Yorum ekranına yönlendir
            router.push({ pathname: '/(customer)/review/[orderId]', params: { orderId: order.id } });
          },
        },
      ]
    );
  };

  // Auth hazır olduğunda ilk yükleme
  useEffect(() => {
    if (user?.id) fetchOrders();
    else setIsLoading(false);
  }, [user?.id, fetchOrders]);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.title, { color: C.text }]}>Siparişlerim</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: C.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: C.primary }]} onPress={() => fetchOrders()}>
            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>📦</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Henüz sipariş yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            İlk siparişini oluşturmak için ana sayfaya git
          </Text>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push('/(customer)/order/create')}
          >
            <Text style={styles.createBtnText}>+ Sipariş Oluştur</Text>
          </TouchableOpacity>
        </View>
      ) : (
        (() => {
          const activeOrders  = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
          const historyOrders = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));

          type ListItem =
            | { kind: 'order'; order: Order }
            | { kind: 'header'; title: string; count: number };

          const listData: ListItem[] = [
            ...(activeOrders.length > 0
              ? [
                  { kind: 'header' as const, title: '📋 Aktif Siparişler', count: activeOrders.length },
                  ...activeOrders.map((o) => ({ kind: 'order' as const, order: o })),
                ]
              : []),
            ...(historyOrders.length > 0
              ? [
                  { kind: 'header' as const, title: '📜 Geçmiş Siparişler', count: historyOrders.length },
                  ...historyOrders.map((o) => ({ kind: 'order' as const, order: o })),
                ]
              : []),
          ];

          return (
            <FlatList
              data={listData}
              keyExtractor={(item) =>
                item.kind === 'header' ? `hdr-${item.title}` : item.order.id
              }
              renderItem={({ item }) => {
                if (item.kind === 'header') {
                  return (
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.sectionHeaderText, { color: C.textSecondary }]}>
                        {item.title}
                        <Text style={[styles.sectionCount, { color: C.placeholder }]}>  {item.count}</Text>
                      </Text>
                    </View>
                  );
                }
                return (
                  <OrderCard
                    order={item.order}
                    colors={C}
                    isCancelling={cancellingId === item.order.id}
                    isCompleting={completingId === item.order.id}
                    isDeletingCard={deletingId === item.order.id}
                    onCancel={() => handleCancel(item.order)}
                    onComplete={() => handleComplete(item.order)}
                    onDelete={() => handleDelete(item.order)}
                  />
                );
              }}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchOrders(true)} tintColor={C.primary} />
              }
            />
          );
        })()
      )}
    </SafeAreaView>
  );
}

function OrderCard({
  order, colors: C, isCancelling, isCompleting, isDeletingCard, onCancel, onComplete, onDelete,
}: {
  order: Order;
  colors: ThemeColors;
  isCancelling: boolean;
  isCompleting: boolean;
  isDeletingCard: boolean;
  onCancel: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_LABELS[order.status];
  const date = order.created_at
    ? new Date(order.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const canViewOffers = ['offers_received', 'accepted', 'in_progress', 'ready'].includes(order.status);
  const canComplete   = ['accepted', 'in_progress', 'ready'].includes(order.status);
  const canCancel     = ['pending', 'offers_received', 'accepted'].includes(order.status);
  const isDone        = order.status === 'completed' || order.status === 'cancelled';
  const isReady       = order.status === 'ready';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: C.card, borderColor: isDone ? C.border : C.primary + '33' },
        isDone && { opacity: 0.7 },
      ]}
      onPress={() => router.push({ pathname: '/(customer)/order/[id]', params: { id: order.id } })}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>{order.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.emoji} {status.label}
          </Text>
        </View>
      </View>

      {order.description && (
        <Text style={[styles.cardDesc, { color: C.textSecondary }]} numberOfLines={2}>{order.description}</Text>
      )}

      <View style={styles.cardMeta}>
        {order.serving_size && (
          <Text style={[styles.metaText, { color: C.textSecondary }]}>👥 {order.serving_size} kişilik</Text>
        )}
        {order.delivery_date && (
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            📅 Teslim: {new Date(order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
          </Text>
        )}
        {date ? (
          <Text style={[styles.metaText, { color: C.placeholder }]}>🗓 Talep: {date}</Text>
        ) : null}
      </View>

      {!isDone && (
        <View style={styles.actionRow}>
          {/* Teklif/Sipariş görüntüle */}
          {canViewOffers && (
            <TouchableOpacity
              style={[styles.viewOffersBtn, { backgroundColor: C.primary + '18', borderColor: C.primary + '44' }]}
              onPress={() => router.push({ pathname: '/(customer)/offers/[orderId]', params: { orderId: order.id } })}
            >
              <Text style={[styles.viewOffersBtnText, { color: C.primary }]}>
                {order.status === 'accepted' || order.status === 'in_progress' || order.status === 'ready'
                  ? '✅ Detay →' : '🎉 Teklifler →'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Tamamla (accepted / in_progress / ready) */}
          {canComplete && (
            <TouchableOpacity
              style={[styles.completeBtn, { backgroundColor: isReady ? '#E53E3E' : '#48BB78' }]}
              onPress={onComplete}
              disabled={isCompleting}
            >
              {isCompleting
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.completeBtnText}>{isReady ? '🔔 Teslim Aldım!' : '🎂 Tamamla'}</Text>
              }
            </TouchableOpacity>
          )}

          {/* İptal */}
          {canCancel && (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: C.error + '88' }]}
              onPress={onCancel}
              disabled={isCancelling}
            >
              {isCancelling
                ? <ActivityIndicator size="small" color={C.error} />
                : <Text style={[styles.cancelBtnText, { color: C.error }]}>🗑️</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tamamlanan / İptal edilen siparişleri sil */}
      {isDone && (
        <TouchableOpacity
          style={[styles.deleteBtn, { borderColor: C.border }]}
          onPress={onDelete}
          disabled={isDeletingCard}
        >
          {isDeletingCard
            ? <ActivityIndicator size="small" color={C.textSecondary} />
            : <Text style={[styles.deleteBtnText, { color: C.textSecondary }]}>🗑️ Listeden Kaldır</Text>
          }
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  errorText: { fontSize: FontSize.md, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 10, borderRadius: Radius.full },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  createBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 12, borderRadius: Radius.full, marginTop: Spacing.sm },
  createBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  sectionHeader: { paddingTop: Spacing.sm, paddingBottom: Spacing.xs, marginTop: Spacing.xs },
  sectionHeaderText: { fontSize: FontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: FontSize.xs },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  cardDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metaText: { fontSize: FontSize.xs },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 2 },
  cancelBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
  viewOffersBtn: {
    flex: 1, padding: Spacing.sm,
    borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center',
  },
  viewOffersBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  completeBtn: {
    flex: 1, paddingVertical: 8,
    borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center',
  },
  completeBtnText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },
  deleteBtn: {
    marginTop: 2, paddingVertical: 7,
    borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center',
  },
  deleteBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
});
