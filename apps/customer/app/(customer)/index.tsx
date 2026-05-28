import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, useAuth, useThemeColors, ThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type CustomerOrder = Database['public']['Tables']['orders']['Row'];

const ORDER_STATUS_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  accepted:    { emoji: '✅', label: 'Kabul Edildi',    color: '#48BB78' },
  in_progress: { emoji: '👨‍🍳', label: 'Hazırlanıyor',    color: '#9F7AEA' },
  ready:       { emoji: '📦', label: 'Teslimata Hazır', color: '#4299E1' },
};

const DELIVERY_LABELS: Record<string, string> = {
  delivery: '🚚 Adrese Teslim',
  pickup:   '🏪 Gel-Al',
};

export default function CustomerHomeScreen() {
  const C = useThemeColors();
  const { profile, signOut } = useAuth();

  const [orders, setOrders]           = useState<CustomerOrder[]>([]);
  const [offerCounts, setOfferCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── Siparişler + Teklif Sayıları ─────────────────────────────────────────
  const fetchAll = useCallback(async (refresh = false) => {
    if (!profile?.id) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    // Aktif siparişler (pending → ready)
    const { data: orderData } = await _db
      .from('orders')
      .select('*')
      .eq('customer_id', profile.id)
      .in('status', ['pending', 'accepted', 'in_progress', 'ready'])
      .order('created_at', { ascending: false });

    const active = (orderData ?? []) as CustomerOrder[];
    setOrders(active);

    // Her sipariş için teklif sayısı — tek sorguda
    if (active.length > 0) {
      const orderIds = active.map((o) => o.id);
      const { data: offerRows } = await _db
        .from('offers')
        .select('order_id')
        .in('order_id', orderIds)
        .neq('status', 'rejected');

      const counts: Record<string, number> = {};
      (offerRows ?? []).forEach((o: { order_id: string }) => {
        counts[o.order_id] = (counts[o.order_id] ?? 0) + 1;
      });
      setOfferCounts(counts);
    } else {
      setOfferCounts({});
    }

    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, [profile?.id]);

  // Profile hazır olunca ilk yükleme
  useEffect(() => {
    if (profile?.id) fetchAll();
    else setIsLoading(false);
  }, [profile?.id, fetchAll]);

  // Tab'a her odaklanınca güncelle (sipariş oluşturduktan / tekliften sonra)
  useFocusEffect(useCallback(() => {
    if (profile?.id) fetchAll();
  }, [profile?.id, fetchAll]));

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <View>
          <Text style={[styles.greeting, { color: C.textSecondary }]}>Merhaba 👋</Text>
          <Text style={[styles.name, { color: C.text }]}>
            {profile?.full_name?.split(' ')[0] ?? 'Misafir'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: C.border }]}
          onPress={signOut}
        >
          <Text style={[styles.signOutText, { color: C.textSecondary }]}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      {/* İçerik */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>Yükleniyor…</Text>
        </View>
      ) : orders.length === 0 ? (
        /* Hiç sipariş yok */
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🎂</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Sipariş oluştur</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Bir sipariş ver; yakındaki pastacılar sana teklif göndersin, en iyisini seç!
          </Text>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push('/(customer)/order/create')}
          >
            <Text style={styles.ctaBtnText}>+ Sipariş Ver</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              offerCount={offerCounts[item.id] ?? 0}
              colors={C}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchAll(true)}
              tintColor={C.primary}
            />
          }
          ListHeaderComponent={
            <Text style={[styles.listHeader, { color: C.textSecondary }]}>
              {orders.length} aktif siparişin
            </Text>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={[styles.newOrderBtn, { borderColor: C.primary }]}
              onPress={() => router.push('/(customer)/order/create')}
            >
              <Text style={[styles.newOrderBtnText, { color: C.primary }]}>+ Yeni Sipariş Ver</Text>
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── OrderCard ────────────────────────────────────────────────────────────────
function OrderCard({
  order, offerCount, colors: C,
}: {
  order: CustomerOrder;
  offerCount: number;
  colors: ThemeColors;
}) {
  const isPending  = order.status === 'pending';
  const hasOffers  = offerCount > 0;
  const statusConf = ORDER_STATUS_CONFIG[order.status];

  const handlePress = () => {
    router.push({ pathname: '/(customer)/order/[id]', params: { id: order.id } });
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: C.card, borderColor: hasOffers ? C.primary : C.border },
        hasOffers && styles.cardHighlight,
      ]}
      activeOpacity={0.85}
      onPress={handlePress}
    >
      {/* Başlık + teslimat tipi */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>
          {order.title}
        </Text>
        {order.delivery_type && (
          <View style={[styles.deliveryBadge, { backgroundColor: C.background, borderColor: C.border }]}>
            <Text style={[styles.deliveryBadgeText, { color: C.textSecondary }]}>
              {DELIVERY_LABELS[order.delivery_type] ?? order.delivery_type}
            </Text>
          </View>
        )}
      </View>

      {/* Açıklama */}
      {order.description ? (
        <Text style={[styles.cardDesc, { color: C.textSecondary }]} numberOfLines={2}>
          {order.description}
        </Text>
      ) : null}

      {/* Meta chips */}
      <View style={styles.metaRow}>
        {order.serving_size ? (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]}>
              👥 {order.serving_size} kişilik
            </Text>
          </View>
        ) : null}
        {order.delivery_date ? (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]}>
              📅 {new Date(order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Durum: pending → teklif sayısı veya bekleniyor */}
      {isPending ? (
        hasOffers ? (
          <View style={[styles.offersBanner, { backgroundColor: C.primary }]}>
            <Text style={styles.offersBannerText}>
              🎉 {offerCount} teklif geldi! Görüntüle →
            </Text>
          </View>
        ) : (
          <View style={[styles.waitingBanner, { backgroundColor: C.card, borderColor: C.border }]}>
            <ActivityIndicator size="small" color={C.textSecondary} style={{ marginRight: 6 }} />
            <Text style={[styles.waitingText, { color: C.textSecondary }]}>
              Teklif bekleniyor…
            </Text>
          </View>
        )
      ) : statusConf ? (
        /* accepted / in_progress / ready */
        <View style={[styles.statusBanner, { backgroundColor: statusConf.color + '18' }]}>
          <Text style={[styles.statusBannerText, { color: statusConf.color }]}>
            {statusConf.emoji} {statusConf.label}
            {order.status === 'ready'
              ? ' · Teslim Al! →'
              : ' · Siparişlerim →'}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  greeting: { fontSize: FontSize.sm },
  name: { fontSize: FontSize.xl, fontWeight: '800' },
  signOutBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  signOutText: { fontSize: FontSize.xs, fontWeight: '600' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  loadingText: { fontSize: FontSize.md },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  ctaBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 14, borderRadius: Radius.full, marginTop: Spacing.sm },
  ctaBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
  listHeader: { fontSize: FontSize.sm, marginBottom: Spacing.xs },

  newOrderBtn: {
    marginTop: Spacing.sm, paddingVertical: 14, borderRadius: Radius.full,
    borderWidth: 1.5, alignItems: 'center',
  },
  newOrderBtnText: { fontSize: FontSize.md, fontWeight: '700' },

  // Kart
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardHighlight: { borderWidth: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  deliveryBadge: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  deliveryBadgeText: { fontSize: FontSize.xs, fontWeight: '600' },
  cardDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  metaRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  metaChipText: { fontSize: FontSize.xs },

  offersBanner: {
    paddingVertical: 10, paddingHorizontal: Spacing.md,
    borderRadius: Radius.full, alignItems: 'center',
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 3,
  },
  offersBannerText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },

  waitingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: Spacing.md,
    borderRadius: Radius.full, borderWidth: 1,
  },
  waitingText: { fontSize: FontSize.sm },

  statusBanner: {
    paddingVertical: 8, paddingHorizontal: Spacing.md,
    borderRadius: Radius.full, alignItems: 'center',
  },
  statusBannerText: { fontSize: FontSize.sm, fontWeight: '700' },
});
