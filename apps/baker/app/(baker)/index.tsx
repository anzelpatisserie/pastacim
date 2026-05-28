import { useEffect, useState, useCallback } from 'react';
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
import * as Location from 'expo-location';
import { supabase, rpcNearbyOrders, useAuth, useThemeColors, Spacing, Radius, FontSize, DEFAULT_LOCATION, DEFAULT_RADIUS_KM } from '@pastacim/shared';
import type { Database, ThemeColors } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type NearbyOrder = Database['public']['Functions']['nearby_orders']['Returns'][number];

type MyOffer = {
  id: string;
  order_id: string;
  price: number;
  status: string;
};

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  delivery: '🚚 Adrese Teslim',
  pickup: '🏪 Gel-Al',
};

const OFFER_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:  { label: '⏳ Teklifim bekleniyor', bg: '#ECC94B22', text: '#B7791F' },
  accepted: { label: '✅ Teklifim kabul edildi', bg: '#48BB7822', text: '#276749' },
  rejected: { label: '❌ Teklifim reddedildi', bg: '#FC818122', text: '#C53030' },
};

export default function BakerHomeScreen() {
  const C = useThemeColors();
  const { profile, signOut, user } = useAuth();

  const [orders, setOrders] = useState<NearbyOrder[]>([]);
  const [myOfferMap, setMyOfferMap] = useState<Map<string, MyOffer>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [shopLocation, setShopLocation] = useState<{ lat: number; lng: number } | null>(null);

  // ─── Konum: önce dükkan koordinatı, yoksa cihaz GPS ───────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      // Dükkan koordinatı — en güvenilir kaynak
      const { data: shop } = await _db
        .from('pastry_shops')
        .select('latitude, longitude')
        .eq('user_id', profile.id)
        .single();

      if (shop?.latitude && shop?.longitude) {
        setShopLocation({ lat: shop.latitude, lng: shop.longitude });
        return;
      }

      // Dükkan koordinatı yoksa cihaz GPS
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShopLocation({ lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude });
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setShopLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        setShopLocation({ lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude });
      }
    })();
  }, [profile?.id]);

  // ─── Yakındaki Talepleri + Kendi Tekliflerimi Getir ───────────────────────
  const fetchOrders = useCallback(async (refresh = false) => {
    if (!shopLocation) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    const { data, error: rpcError } = await rpcNearbyOrders({
      lat: shopLocation.lat,
      lng: shopLocation.lng,
      radius_km: radiusKm,
    });

    if (rpcError) {
      setError('Talepler yüklenemedi. Lütfen tekrar deneyin.');
      if (refresh) setIsRefreshing(false);
      else setIsLoading(false);
      return;
    }

    const newOrders = data ?? [];
    setOrders(newOrders);

    // Kendi tekliflerimi getir (bu siparişler için)
    if (newOrders.length > 0 && user?.id) {
      const orderIds = newOrders.map((o) => o.id);
      const { data: offerData } = await _db
        .from('offers')
        .select('id, order_id, price, status')
        .eq('baker_id', user.id)
        .in('order_id', orderIds);
      setMyOfferMap(new Map((offerData ?? []).map((o: MyOffer) => [o.order_id, o])));
    } else {
      setMyOfferMap(new Map());
    }

    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, [shopLocation, radiusKm, user?.id]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Tab'a odaklanınca teklif durumunu güncelle
  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <View>
          <Text style={[styles.greeting, { color: C.textSecondary }]}>Hoş geldin 👨‍🍳</Text>
          <Text style={[styles.name, { color: C.text }]}>
            {profile?.full_name?.split(' ')[0] ?? 'Pastacı'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: C.border }]}
          onPress={signOut}
        >
          <Text style={[styles.signOutText, { color: C.textSecondary }]}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      {/* Mesafe Filtresi */}
      <View style={[styles.filterBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <Text style={[styles.filterLabel, { color: C.textSecondary }]}>
          📍 Arama: <Text style={{ color: C.primary, fontWeight: '700' }}>{radiusKm} km</Text>
        </Text>
        <View style={styles.radiusButtons}>
          {[5, 10, 20, 50].map((km) => (
            <TouchableOpacity
              key={km}
              style={[
                styles.radiusBtn,
                {
                  backgroundColor: radiusKm === km ? C.primary : C.background,
                  borderColor: radiusKm === km ? C.primary : C.border,
                },
              ]}
              onPress={() => setRadiusKm(km)}
            >
              <Text style={[styles.radiusBtnText, { color: radiusKm === km ? '#FFF' : C.textSecondary }]}>
                {km}km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* İçerik */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>Talepler aranıyor…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>😢</Text>
          <Text style={[styles.errorText, { color: C.text }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: C.primary }]}
            onPress={() => fetchOrders()}
          >
            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Bu bölgede talep yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Mesafe aralığını artırabilirsin
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestCard
              order={item}
              colors={C}
              myOffer={myOfferMap.get(item.id)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchOrders(true)}
              tintColor={C.primary}
            />
          }
          ListHeaderComponent={
            <Text style={[styles.listHeader, { color: C.textSecondary }]}>
              {orders.length} açık talep · {myOfferMap.size} teklifim var
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── RequestCard ─────────────────────────────────────────────────────────────
function RequestCard({
  order, colors: C, myOffer,
}: {
  order: NearbyOrder;
  colors: ThemeColors;
  myOffer?: MyOffer;
}) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
    });
  };

  const offerConfig = myOffer ? OFFER_STATUS_CONFIG[myOffer.status] : null;
  const alreadyOffered = !!myOffer && myOffer.status !== 'rejected';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: C.card, borderColor: alreadyOffered ? C.primary : C.border },
        alreadyOffered && { borderWidth: 2 },
      ]}
      activeOpacity={0.8}
      onPress={() => router.push({ pathname: '/(baker)/offer/[orderId]', params: { orderId: order.id } })}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>
          {order.title}
        </Text>
        <View style={[styles.deliveryBadge, { backgroundColor: C.primary + '18', borderColor: C.primary + '44' }]}>
          <Text style={[styles.deliveryBadgeText, { color: C.primary }]}>
            {DELIVERY_TYPE_LABELS[order.delivery_type ?? 'delivery']}
          </Text>
        </View>
      </View>

      {order.description && (
        <Text style={[styles.cardDesc, { color: C.textSecondary }]} numberOfLines={2}>
          {order.description}
        </Text>
      )}

      <View style={styles.cardMeta}>
        {order.serving_size && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]}>
              👥 {order.serving_size} kişilik
            </Text>
          </View>
        )}
        {order.delivery_date && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]}>
              📅 Teslim: {formatDate(order.delivery_date)}
            </Text>
          </View>
        )}
        {order.created_at && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.placeholder }]}>
              🗓 Talep: {formatDate(order.created_at)}
            </Text>
          </View>
        )}
      </View>

      {/* Kendi teklif durumu */}
      {offerConfig && (
        <View style={[styles.myOfferBadge, { backgroundColor: offerConfig.bg }]}>
          <Text style={[styles.myOfferText, { color: offerConfig.text }]}>
            {offerConfig.label}
            {myOffer?.status === 'pending' ? `  ·  ₺${myOffer.price}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={[styles.cardDistance, { color: C.primary }]}>
          📍 {order.distance_km} km uzakta
        </Text>
        {alreadyOffered ? (
          <View style={[styles.offeredBtn, { borderColor: C.primary + '66' }]}>
            <Text style={[styles.offeredBtnText, { color: C.primary }]}>Güncelle →</Text>
          </View>
        ) : (
          <View style={[styles.offerBtn, { backgroundColor: C.primary }]}>
            <Text style={styles.offerBtnText}>Teklif Ver →</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  greeting: { fontSize: FontSize.sm },
  name: { fontSize: FontSize.xl, fontWeight: '800' },
  signOutBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  signOutText: { fontSize: FontSize.xs, fontWeight: '600' },
  filterBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  filterLabel: { fontSize: FontSize.sm },
  radiusButtons: { flexDirection: 'row', gap: Spacing.xs },
  radiusBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  radiusBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  loadingText: { fontSize: FontSize.md },
  errorEmoji: { fontSize: 48 },
  errorText: { fontSize: FontSize.md, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 10, borderRadius: Radius.full },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  listHeader: { fontSize: FontSize.sm, marginBottom: Spacing.xs },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  deliveryBadge: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  deliveryBadgeText: { fontSize: FontSize.xs, fontWeight: '600' },
  cardDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  metaChipText: { fontSize: FontSize.xs },
  myOfferBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  myOfferText: { fontSize: FontSize.sm, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDistance: { fontSize: FontSize.sm, fontWeight: '600' },
  offerBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  offerBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  offeredBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  offeredBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});
